use chacha20poly1305::{
    XChaCha20Poly1305, XNonce,
    aead::{Aead, Generate, KeyInit},
};
use iroh::{PublicKey, SecretKey, Signature};
use iroh_blobs::Hash;
use iroh_gossip::TopicId;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use xxhash_rust::xxh3::xxh3_128;

use crate::{
    db::model::config::ConfigEntry,
    error::{Error, Result},
    family::{now_ms, roster::SignedRoster},
    util::device::Platform,
};

const GOSSIP_SIGN_DOMAIN: &[u8] = b"zephyr/family/msg/0";
const CLIPBOARD_KEY_DOMAIN: &[u8] = b"zephyr/family/clip/0";
const CONFIG_KEY_DOMAIN: &[u8] = b"zephyr/family/config/0";

#[derive(Debug, Serialize, Deserialize)]
pub enum GossipPayload {
    /// Announce ourselves on join / neighbor-up / lag recovery.
    Hello {
        name: String,
        platform: Platform,
        epoch: u64,
    },
    Heartbeat,
    /// Graceful shutdown or leave.
    Goodbye,
    /// Fast-path hint that a newer epoch exists; receivers fetch the secret
    /// via a direct sync with a member.
    MembershipChanged {
        roster: SignedRoster,
    },
    /// Clipboard text, sealed with a key derived from the epoch secret.
    /// New variants must be appended after this one: postcard encodes by
    /// variant index.
    Clipboard {
        stamp: u64,
        sealed: Sealed,
    },
    Config {
        sealed: Sealed,
    },
}

#[derive(Serialize, Deserialize)]
pub struct Sealed {
    nonce: [u8; 24],
    ciphertext: Vec<u8>,
}

impl std::fmt::Debug for Sealed {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "<sealed, {} bytes>", self.ciphertext.len())
    }
}

/// Wall clock, but always at least one tick past whatever we last saw, so a
/// lagging clock still wins against its own past.
pub fn next_stamp(last_stamp: Option<u64>) -> u64 {
    match last_stamp {
        Some(last) => now_ms().max(last + 1),
        None => now_ms(),
    }
}

/// Whether incoming clipboard content should replace what we hold.
pub fn should_apply(last: Option<(u128, u64)>, hash: u128, stamp: u64) -> bool {
    match last {
        Some((last_hash, last_stamp)) => hash != last_hash && stamp > last_stamp,
        None => true,
    }
}

fn clipboard_key(epoch_secret: &[u8; 32]) -> [u8; 32] {
    let mut hasher = Sha256::new();
    hasher.update(CLIPBOARD_KEY_DOMAIN);
    hasher.update(epoch_secret);
    hasher.finalize().into()
}

fn clipboard_cipher(epoch_secret: &[u8; 32]) -> Result<XChaCha20Poly1305> {
    XChaCha20Poly1305::new_from_slice(&clipboard_key(epoch_secret))
        .map_err(|_| Error::ClipboardCrypto)
}

fn config_key(epoch_secret: &[u8; 32]) -> [u8; 32] {
    let mut hasher = Sha256::new();
    hasher.update(CONFIG_KEY_DOMAIN);
    hasher.update(epoch_secret);
    hasher.finalize().into()
}

fn config_cipher(epoch_secret: &[u8; 32]) -> Result<XChaCha20Poly1305> {
    XChaCha20Poly1305::new_from_slice(&config_key(epoch_secret)).map_err(|_| Error::ConfigCrypto)
}

/// Filenames live in here rather than beside the ciphertext so they stay sealed.
#[derive(Debug, Serialize, Deserialize)]
pub enum ClipboardBody {
    Text(String),
    BlobText {
        hash: Hash,
        size: u64,
    },
    Files {
        hash: Hash,
        total_size: u64,
        names: Vec<String>,
    },
}

impl ClipboardBody {
    /// Content-addressed for the blob variants, so the same files copied from a
    /// different directory still resolve to the same id.
    pub fn content_id(&self) -> u128 {
        match self {
            Self::Text(text) => xxh3_128(text.as_bytes()),
            Self::BlobText { hash, .. } | Self::Files { hash, .. } => xxh3_128(hash.as_bytes()),
        }
    }
}

pub fn seal_clipboard(
    body: &ClipboardBody,
    stamp: u64,
    epoch_secret: &[u8; 32],
) -> Result<GossipPayload> {
    let cipher = clipboard_cipher(epoch_secret)?;
    let nonce = XNonce::generate();

    let plaintext = postcard::to_stdvec(body)?;
    let ciphertext = cipher
        .encrypt(&nonce, plaintext.as_slice())
        .map_err(|_| Error::ClipboardCrypto)?;

    Ok(GossipPayload::Clipboard {
        stamp,
        sealed: Sealed {
            nonce: nonce.into(),
            ciphertext,
        },
    })
}

pub fn open_clipboard(sealed: &Sealed, epoch_secret: &[u8; 32]) -> Result<ClipboardBody> {
    let cipher = clipboard_cipher(epoch_secret)?;

    let plaintext = cipher
        .decrypt(&XNonce::from(sealed.nonce), &sealed.ciphertext[..])
        .map_err(|_| Error::ClipboardCrypto)?;

    Ok(postcard::from_bytes(&plaintext)?)
}

pub fn seal_config(entries: &[ConfigEntry], epoch_secret: &[u8; 32]) -> Result<GossipPayload> {
    let cipher = config_cipher(epoch_secret)?;
    let nonce = XNonce::generate();

    let plaintext = postcard::to_stdvec(entries)?;
    let ciphertext = cipher
        .encrypt(&nonce, plaintext.as_slice())
        .map_err(|_| Error::ConfigCrypto)?;

    Ok(GossipPayload::Config {
        sealed: Sealed {
            nonce: nonce.into(),
            ciphertext,
        },
    })
}

pub fn open_config(sealed: &Sealed, epoch_secret: &[u8; 32]) -> Result<Vec<ConfigEntry>> {
    let cipher = config_cipher(epoch_secret)?;

    let plaintext = cipher
        .decrypt(&XNonce::from(sealed.nonce), &sealed.ciphertext[..])
        .map_err(|_| Error::ConfigCrypto)?;

    Ok(postcard::from_bytes(&plaintext)?)
}

#[derive(Debug, Serialize, Deserialize)]
pub struct SignedEnvelope {
    pub from: PublicKey,
    pub sent_at_ms: u64,
    pub payload: GossipPayload,
    pub signature: Signature,
}

#[derive(Debug, Serialize, Deserialize)]
pub enum FamilyGossip {
    V0(SignedEnvelope),
}

fn envelope_digest(
    topic: &TopicId,
    from: &PublicKey,
    sent_at_ms: u64,
    payload: &GossipPayload,
) -> Result<[u8; 32]> {
    let mut hasher = Sha256::new();
    hasher.update(GOSSIP_SIGN_DOMAIN);
    hasher.update(topic.as_bytes());
    hasher.update(from.as_bytes());
    hasher.update(sent_at_ms.to_le_bytes());
    hasher.update(postcard::to_stdvec(payload)?);
    Ok(hasher.finalize().into())
}

impl FamilyGossip {
    pub fn sign(payload: GossipPayload, topic: &TopicId, key: &SecretKey) -> Result<Self> {
        let from = key.public();
        let sent_at_ms = now_ms();
        let digest = envelope_digest(topic, &from, sent_at_ms, &payload)?;

        Ok(Self::V0(SignedEnvelope {
            from,
            sent_at_ms,
            payload,
            signature: key.sign(&digest),
        }))
    }

    /// Verify the signature against the topic it arrived on and return the
    /// sender + payload.
    pub fn verify(self, topic: &TopicId) -> Result<(PublicKey, GossipPayload)> {
        let Self::V0(envelope) = self;

        let digest = envelope_digest(
            topic,
            &envelope.from,
            envelope.sent_at_ms,
            &envelope.payload,
        )?;
        envelope
            .from
            .verify(&digest, &envelope.signature)
            .map_err(|_| Error::RosterSignature)?;

        Ok((envelope.from, envelope.payload))
    }

    pub fn to_bytes(&self) -> Result<Vec<u8>> {
        Ok(postcard::to_stdvec(self)?)
    }

    pub fn from_bytes(bytes: &[u8]) -> Result<Self> {
        Ok(postcard::from_bytes(bytes)?)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn envelope_roundtrip_and_topic_binding() {
        let key = SecretKey::generate();
        let topic = TopicId::from([5u8; 32]);
        let other_topic = TopicId::from([6u8; 32]);

        let msg = FamilyGossip::sign(GossipPayload::Heartbeat, &topic, &key).unwrap();
        let bytes = msg.to_bytes().unwrap();

        let decoded = FamilyGossip::from_bytes(&bytes).unwrap();
        let (from, payload) = decoded.verify(&topic).unwrap();
        assert_eq!(from, key.public());
        assert!(matches!(payload, GossipPayload::Heartbeat));

        // Replaying the same envelope on a different topic fails verification.
        let decoded = FamilyGossip::from_bytes(&bytes).unwrap();
        assert!(decoded.verify(&other_topic).is_err());
    }

    #[test]
    fn tampered_sender_fails() {
        let key = SecretKey::generate();
        let mallory = SecretKey::generate();
        let topic = TopicId::from([5u8; 32]);

        let msg = FamilyGossip::sign(GossipPayload::Heartbeat, &topic, &key).unwrap();
        let FamilyGossip::V0(mut envelope) = msg;
        envelope.from = mallory.public();

        assert!(FamilyGossip::V0(envelope).verify(&topic).is_err());
    }

    fn config_entries() -> Vec<ConfigEntry> {
        vec![ConfigEntry {
            key: "clipboard.sync".to_string(),
            value: vec![1],
            stamp: 42,
            author: SecretKey::generate().public(),
        }]
    }

    #[test]
    fn config_seal_roundtrip() {
        let secret = [9u8; 32];
        let entries = config_entries();

        let GossipPayload::Config { sealed } = seal_config(&entries, &secret).unwrap() else {
            panic!("expected a config payload");
        };

        assert_eq!(open_config(&sealed, &secret).unwrap(), entries);

        assert!(open_config(&sealed, &[8u8; 32]).is_err());

        let mut tampered = sealed;
        tampered.ciphertext[0] ^= 1;
        assert!(open_config(&tampered, &secret).is_err());
    }

    #[test]
    fn config_and_clipboard_keys_are_independent() {
        let secret = [9u8; 32];

        let GossipPayload::Config { sealed } = seal_config(&config_entries(), &secret).unwrap()
        else {
            panic!("expected a config payload");
        };

        assert!(open_clipboard(&sealed, &secret).is_err());
    }

    #[test]
    fn existing_payload_variants_keep_their_indices() {
        let cases = [
            (
                0u8,
                GossipPayload::Hello {
                    name: "a".to_string(),
                    platform: Platform::Macos,
                    epoch: 1,
                },
            ),
            (1, GossipPayload::Heartbeat),
            (2, GossipPayload::Goodbye),
        ];

        for (index, payload) in cases {
            assert_eq!(postcard::to_stdvec(&payload).unwrap()[0], index);
        }

        let sealed = Sealed {
            nonce: [0u8; 24],
            ciphertext: vec![1],
        };
        assert_eq!(
            postcard::to_stdvec(&GossipPayload::Clipboard { stamp: 1, sealed }).unwrap()[0],
            4
        );
    }

    #[test]
    fn clipboard_seal_roundtrip() {
        let secret = [7u8; 32];
        let other_secret = [8u8; 32];

        let body = ClipboardBody::Text("hunter2".to_string());
        let GossipPayload::Clipboard { sealed, .. } = seal_clipboard(&body, 1, &secret).unwrap()
        else {
            panic!("expected a clipboard payload");
        };

        assert!(!sealed.ciphertext.windows(7).any(|w| w == b"hunter2"));
        assert!(!format!("{sealed:?}").contains("hunter2"));

        let opened = open_clipboard(&sealed, &secret).unwrap();
        assert!(matches!(opened, ClipboardBody::Text(t) if t == "hunter2"));

        assert!(open_clipboard(&sealed, &other_secret).is_err());

        let mut tampered = Sealed {
            nonce: sealed.nonce,
            ciphertext: sealed.ciphertext.clone(),
        };
        tampered.ciphertext[0] ^= 0xff;
        assert!(open_clipboard(&tampered, &secret).is_err());
    }

    /// Filenames must not be readable from the wire — they say a lot about what
    /// someone is working on.
    #[test]
    fn file_names_are_sealed() {
        let secret = [7u8; 32];
        let body = ClipboardBody::Files {
            hash: Hash::new(b"content"),
            total_size: 4096,
            names: vec!["severance-package.pdf".to_string()],
        };

        let GossipPayload::Clipboard { sealed, .. } = seal_clipboard(&body, 1, &secret).unwrap()
        else {
            panic!("expected a clipboard payload");
        };

        assert!(!sealed.ciphertext.windows(9).any(|w| w == b"severance"));

        let opened = open_clipboard(&sealed, &secret).unwrap();
        let ClipboardBody::Files {
            total_size, names, ..
        } = opened
        else {
            panic!("expected files");
        };
        assert_eq!(total_size, 4096);
        assert_eq!(names, vec!["severance-package.pdf".to_string()]);
    }

    /// Content-addressing is what stops a re-copy from the receiving device
    /// bouncing back: same bytes, same hash, same id, whatever the paths were.
    #[test]
    fn content_id_follows_content_not_paths() {
        let hash = Hash::new(b"same bytes");

        let a = ClipboardBody::Files {
            hash,
            total_size: 10,
            names: vec!["a/x.pdf".to_string()],
        };
        let b = ClipboardBody::Files {
            hash,
            total_size: 10,
            names: vec!["totally/different/x.pdf".to_string()],
        };
        assert_eq!(a.content_id(), b.content_id());

        let other = ClipboardBody::Files {
            hash: Hash::new(b"other bytes"),
            total_size: 10,
            names: vec!["a/x.pdf".to_string()],
        };
        assert_ne!(a.content_id(), other.content_id());
    }

    #[test]
    fn clipboard_nonces_are_unique() {
        let secret = [7u8; 32];
        let body = ClipboardBody::Text("same text".to_string());
        let seal = || match seal_clipboard(&body, 1, &secret).unwrap() {
            GossipPayload::Clipboard { sealed, .. } => sealed.nonce,
            _ => unreachable!(),
        };

        assert_ne!(seal(), seal());
    }

    #[test]
    fn identical_content_is_never_reapplied() {
        let last = Some((42, 1000));

        assert!(!should_apply(last, 42, 1001));
        assert!(!should_apply(last, 42, 9999));
    }

    #[test]
    fn stale_content_loses_to_newer() {
        let last = Some((42, 1000));

        assert!(!should_apply(last, 7, 999));
        assert!(!should_apply(last, 7, 1000));
        assert!(should_apply(last, 7, 1001));
        assert!(should_apply(None, 7, 0));
    }

    #[test]
    fn lagging_clock_still_converges() {
        let peer_stamp = now_ms() + 300_000;
        let last = Some((42u128, peer_stamp));

        let ours = next_stamp(Some(peer_stamp));
        assert!(ours > peer_stamp);
        assert!(should_apply(last, 7, ours));
    }

    #[test]
    fn fresh_stamp_tracks_wall_clock() {
        let stamp = next_stamp(None);
        assert!(stamp.abs_diff(now_ms()) < 1000);
    }
}
