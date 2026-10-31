use iroh::PublicKey;
use iroh_gossip::TopicId;
use sha2::{Digest, Sha256};
use surrealdb::{Surreal, engine::local::Db};

use crate::{
    db::model::{
        Controller,
        family::{FamilyController, FamilyState},
        peer::{NewPeer, PeerController, PeerKind, PeerPatch, TrustLevel},
    },
    error::Result,
    family::roster::SignedRoster,
};

pub mod api;
pub mod gossip;
pub mod handler;
pub mod roster;
pub mod runtime;

pub fn family_topic(family_id: &[u8; 32], epoch: u64, epoch_secret: &[u8; 32]) -> TopicId {
    let mut hasher = Sha256::new();
    hasher.update(b"zephyr/family/topic/0");
    hasher.update(family_id);
    hasher.update(epoch.to_le_bytes());
    hasher.update(epoch_secret);
    TopicId::from(<[u8; 32]>::from(hasher.finalize()))
}

pub fn generate_secret() -> [u8; 32] {
    rand::random()
}

pub fn now_ms() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

/// Where an incoming roster arrived from — determines which trust anchor
/// authorizes it.
pub enum AdoptContext {
    /// During pairing, right after mutual code confirmation: the confirmed
    /// remote endpoint is trusted as the roster author.
    Pairing { confirmed_peer: PublicKey },
    /// Over a direct QUIC-authenticated connection (sync response, epoch push).
    /// `from` is the connection's remote endpoint id.
    Direct { from: PublicKey },
    /// Via the gossip channel. Never accompanied by an epoch secret.
    Gossip { from: PublicKey },
}

#[derive(Debug, PartialEq)]
pub enum Evaluation {
    /// Valid, authorized, and strictly newer (or tie-winning): adopt it.
    Adopt,
    /// Identical to what we already hold (same epoch, same hash).
    AlreadyCurrent,
    /// Older epoch, or lost the equal-epoch tiebreak. Not an error — the
    /// sender is simply behind.
    Stale,
    /// Signature invalid, author not trusted, or no context that allows it.
    Unauthorized,
}

/// The single acceptance rule for incoming rosters (plan §adopt_roster).
/// Pure so the accept/reject matrix is unit-testable.
pub fn evaluate_roster(
    current: Option<&FamilyState>,
    incoming: &SignedRoster,
    ctx: &AdoptContext,
) -> Evaluation {
    if incoming.verify().is_err() {
        return Evaluation::Unauthorized;
    }

    let Some(current) = current else {
        // No family yet: only a pairing welcome from the confirmed peer counts.
        return match ctx {
            AdoptContext::Pairing { confirmed_peer } if incoming.doc.author == *confirmed_peer => {
                Evaluation::Adopt
            }
            _ => Evaluation::Unauthorized,
        };
    };

    let same_family = incoming.doc.family_id == current.family_id;

    let authorized = match ctx {
        AdoptContext::Pairing { confirmed_peer } => incoming.doc.author == *confirmed_peer,
        // Same family: the author must (still) be someone we trust. A leaver
        // authors a roster without itself, so the check runs against OUR
        // current roster, which still includes them.
        // Family switch (merge forwarding): the author belongs to the new
        // family and may be unknown to us — the trust anchor is the member of
        // our old roster we are directly connected to.
        AdoptContext::Direct { from } => {
            if same_family {
                current.roster.contains(&incoming.doc.author) && current.roster.contains(from)
            } else {
                current.roster.contains(from)
            }
        }
        // Gossip can only move us within our own family; secrets never ride it.
        AdoptContext::Gossip { from } => {
            same_family
                && current.roster.contains(&incoming.doc.author)
                && current.roster.contains(from)
        }
    };

    if !authorized {
        return Evaluation::Unauthorized;
    }

    if !same_family {
        // Authorized family switch supersedes epoch comparison — it is a
        // different epoch sequence.
        return Evaluation::Adopt;
    }

    match incoming.doc.epoch.cmp(&current.epoch) {
        std::cmp::Ordering::Greater => Evaluation::Adopt,
        std::cmp::Ordering::Less => Evaluation::Stale,
        std::cmp::Ordering::Equal => {
            let (Ok(theirs), Ok(ours)) = (incoming.hash(), current.roster.hash()) else {
                return Evaluation::Unauthorized;
            };
            match theirs.cmp(&ours) {
                std::cmp::Ordering::Equal => Evaluation::AlreadyCurrent,
                // Deterministic convergence: everyone picks the smaller hash.
                std::cmp::Ordering::Less => Evaluation::Adopt,
                std::cmp::Ordering::Greater => Evaluation::Stale,
            }
        }
    }
}

#[derive(Debug, Default, Clone)]
pub struct RosterDiff {
    pub added: Vec<PublicKey>,
    pub removed: Vec<PublicKey>,
}

/// Project the adopted roster onto peer rows: members become trusted devices,
/// dropped devices are demoted back to untrusted contacts. This is the only
/// writer of `TrustLevel::Trusted`, which is what makes shares between family
/// devices skip the accept prompt (net/proto/share.rs:129).
pub async fn sync_peers_to_roster(
    db: &Surreal<Db>,
    roster: &SignedRoster,
    self_id: PublicKey,
) -> Result<RosterDiff> {
    let mut diff = RosterDiff::default();

    let existing_devices = PeerController::get_by_kind(db, PeerKind::Device).await?;

    for member in &roster.doc.members {
        if member.endpoint_id == self_id {
            continue;
        }

        let was_device = existing_devices
            .iter()
            .any(|p| p.endpoint_id == member.endpoint_id);
        if !was_device {
            diff.added.push(member.endpoint_id);
        }

        let new_peer = NewPeer {
            endpoint_id: member.endpoint_id,
            ticket: member.ticket.clone(),
            name: Some(member.name.clone()),
            platform: Some(member.platform.clone()),
            kind: Some(PeerKind::Device),
            trust_level: Some(TrustLevel::Trusted),
            created_at: None,
            updated_at: None,
            last_seen: None,
        };
        PeerController::create_or_update(db, &new_peer).await?;
    }

    for peer in existing_devices {
        if peer.endpoint_id == self_id || roster.contains(&peer.endpoint_id) {
            continue;
        }

        diff.removed.push(peer.endpoint_id);
        let patch = PeerPatch {
            kind: Some(PeerKind::Contact),
            trust_level: Some(TrustLevel::Untrusted),
            ..Default::default()
        };
        PeerController::update(db, &peer.id.to_string(), &patch).await?;
    }

    Ok(diff)
}

/// Drop pending kicks for anyone the given roster (re-)vouches for: an
/// authoritative roster containing the target means the kick was deliberately
/// undone (e.g. the device was re-paired), and `settle_pending_kicks` must not
/// re-execute it.
pub async fn clear_pending_kicks_for(db: &Surreal<Db>, roster: &SignedRoster) -> Result<()> {
    let Some(row) = FamilyController::get_one(db).await? else {
        return Ok(());
    };
    if row.pending_kicks.is_empty() {
        return Ok(());
    }

    let kept: Vec<PublicKey> = row
        .pending_kicks
        .iter()
        .filter(|k| !roster.contains(k))
        .copied()
        .collect();

    if kept.len() != row.pending_kicks.len() {
        use crate::db::model::family::FamilyPatch;
        let patch = FamilyPatch {
            pending_kicks: Some(kept),
            ..Default::default()
        };
        FamilyController::patch(db, &row.id, &patch).await?;
    }

    Ok(())
}

/// After adopting a roster with a different family id (merge), remember the
/// old family so devices of it that were offline during the merge can still
/// sync into the new one, and queue the new epoch for the old members.
pub async fn record_previous_family(
    db: &Surreal<Db>,
    old_state: &crate::db::model::family::FamilyState,
    self_id: PublicKey,
) -> Result<()> {
    use crate::db::model::family::{FamilyPatch, PreviousFamily};

    let Some(row) = FamilyController::get_one(db).await? else {
        return Ok(());
    };

    let old_hex = hex::encode(old_state.family_id);
    let mut previous = row.previous_families.clone();
    if !previous.iter().any(|p| p.family_id == old_hex) {
        previous.push(PreviousFamily {
            family_id: old_hex,
            members: old_state.roster.member_ids(),
            merged_at_ms: now_ms(),
        });
    }

    // Dual propagation: our old family members need the new family too. They
    // accept it because it arrives from us, a member of their current roster.
    let mut pending = row.pending_epoch_pushes.clone();
    for member in old_state.roster.member_ids() {
        if member != self_id && !pending.contains(&member) {
            pending.push(member);
        }
    }

    let patch = FamilyPatch {
        previous_families: Some(previous),
        pending_epoch_pushes: Some(pending),
        ..Default::default()
    };
    FamilyController::patch(db, &row.id, &patch).await?;

    Ok(())
}

/// Remove all local family state: used when this device was kicked, left, or
/// dissolved the family. Devices demote back to untrusted contacts.
pub async fn wipe_family(db: &Surreal<Db>) -> Result<()> {
    for peer in PeerController::get_by_kind(db, PeerKind::Device).await? {
        let patch = PeerPatch {
            kind: Some(PeerKind::Contact),
            trust_level: Some(TrustLevel::Untrusted),
            ..Default::default()
        };
        PeerController::update(db, &peer.id.to_string(), &patch).await?;
    }

    FamilyController::delete_all(db).await
}

/// Persist a new family state and update the peer projection in one place.
pub async fn apply_state(
    db: &Surreal<Db>,
    state: &FamilyState,
    self_id: PublicKey,
) -> Result<RosterDiff> {
    FamilyController::set_state(db, state).await?;
    sync_peers_to_roster(db, &state.roster, self_id).await
}

#[cfg(test)]
mod tests {
    use iroh::SecretKey;
    use iroh_tickets::endpoint::EndpointTicket;

    use super::*;
    use crate::{family::roster::RosterDoc, util::device::Platform};

    fn member(key: &SecretKey) -> roster::RosterMember {
        let endpoint_id = key.public();
        roster::RosterMember {
            endpoint_id,
            name: "dev".to_string(),
            platform: Platform::Macos,
            ticket: EndpointTicket::from(iroh::EndpointAddr::from(endpoint_id)),
        }
    }

    fn signed(
        family_id: [u8; 32],
        epoch: u64,
        members: &[&SecretKey],
        author: &SecretKey,
    ) -> SignedRoster {
        let doc = RosterDoc {
            version: 0,
            family_id,
            epoch,
            members: members.iter().map(|k| member(k)).collect(),
            author: author.public(),
            issued_at_ms: 0,
        };
        SignedRoster::sign(doc, author).unwrap()
    }

    fn state(roster: SignedRoster) -> FamilyState {
        FamilyState {
            family_id: roster.doc.family_id,
            epoch: roster.doc.epoch,
            epoch_secret: [1u8; 32],
            roster,
        }
    }

    #[test]
    fn topic_changes_with_epoch_and_secret() {
        let base = family_topic(&[1; 32], 1, &[2; 32]);
        assert_eq!(base, family_topic(&[1; 32], 1, &[2; 32]));
        assert_ne!(base, family_topic(&[1; 32], 2, &[2; 32]));
        assert_ne!(base, family_topic(&[1; 32], 1, &[3; 32]));
        assert_ne!(base, family_topic(&[9; 32], 1, &[2; 32]));
    }

    #[test]
    fn no_family_only_accepts_pairing_from_confirmed_peer() {
        let a = SecretKey::generate();
        let b = SecretKey::generate();
        let incoming = signed([1; 32], 1, &[&a, &b], &a);

        let pairing_ok = AdoptContext::Pairing {
            confirmed_peer: a.public(),
        };
        let pairing_wrong = AdoptContext::Pairing {
            confirmed_peer: b.public(),
        };
        let direct = AdoptContext::Direct { from: a.public() };

        assert_eq!(
            evaluate_roster(None, &incoming, &pairing_ok),
            Evaluation::Adopt
        );
        assert_eq!(
            evaluate_roster(None, &incoming, &pairing_wrong),
            Evaluation::Unauthorized
        );
        assert_eq!(
            evaluate_roster(None, &incoming, &direct),
            Evaluation::Unauthorized
        );
    }

    #[test]
    fn stale_and_newer_epochs() {
        let a = SecretKey::generate();
        let b = SecretKey::generate();
        let current = state(signed([1; 32], 5, &[&a, &b], &a));
        let ctx = AdoptContext::Direct { from: a.public() };

        let newer = signed([1; 32], 6, &[&a, &b], &a);
        let older = signed([1; 32], 4, &[&a, &b], &a);

        assert_eq!(
            evaluate_roster(Some(&current), &newer, &ctx),
            Evaluation::Adopt
        );
        assert_eq!(
            evaluate_roster(Some(&current), &older, &ctx),
            Evaluation::Stale
        );
    }

    #[test]
    fn equal_epoch_resolves_by_hash() {
        let a = SecretKey::generate();
        let b = SecretKey::generate();
        let c = SecretKey::generate();

        // Two competing epoch-6 rosters authored by different members.
        let r1 = signed([1; 32], 6, &[&a, &b], &a);
        let r2 = signed([1; 32], 6, &[&a, &c], &a);
        let current = state(signed([1; 32], 5, &[&a, &b, &c], &a));

        let ctx = AdoptContext::Direct { from: a.public() };
        let e1 = evaluate_roster(Some(&state(r1.clone())), &r2, &ctx);
        let e2 = evaluate_roster(Some(&state(r2.clone())), &r1, &ctx);

        // Exactly one side adopts the other; never both, never neither.
        assert!(
            (e1 == Evaluation::Adopt && e2 == Evaluation::Stale)
                || (e1 == Evaluation::Stale && e2 == Evaluation::Adopt),
            "got {e1:?} / {e2:?}"
        );

        // And a device still on epoch 5 accepts either.
        assert_eq!(
            evaluate_roster(Some(&current), &r1, &ctx),
            Evaluation::Adopt
        );

        // Identical roster is a no-op.
        assert_eq!(
            evaluate_roster(Some(&state(r1.clone())), &r1, &ctx),
            Evaluation::AlreadyCurrent
        );
    }

    #[test]
    fn non_member_author_rejected() {
        let a = SecretKey::generate();
        let b = SecretKey::generate();
        let mallory = SecretKey::generate();
        let current = state(signed([1; 32], 5, &[&a, &b], &a));

        let forged = signed([1; 32], 6, &[&mallory, &b], &mallory);
        let ctx = AdoptContext::Direct {
            from: mallory.public(),
        };
        assert_eq!(
            evaluate_roster(Some(&current), &forged, &ctx),
            Evaluation::Unauthorized
        );
    }

    #[test]
    fn leaver_can_author_roster_without_itself() {
        let a = SecretKey::generate();
        let b = SecretKey::generate();
        let current = state(signed([1; 32], 5, &[&a, &b], &a));

        // b leaves: signs a roster that no longer contains b. Receivers still
        // hold b in their current roster, so it is authorized.
        let leave = signed([1; 32], 6, &[&a], &b);
        let ctx = AdoptContext::Direct { from: b.public() };
        assert_eq!(
            evaluate_roster(Some(&current), &leave, &ctx),
            Evaluation::Adopt
        );
    }

    #[test]
    fn family_switch_requires_trusted_direct_peer() {
        let a = SecretKey::generate();
        let b = SecretKey::generate();
        let granter = SecretKey::generate(); // author in the NEW family, unknown to us
        let current = state(signed([1; 32], 5, &[&a, &b], &a));

        let merged = signed([2; 32], 3, &[&granter, &a, &b], &granter);

        // Delivered by b (member of our old roster) → accepted.
        let from_member = AdoptContext::Direct { from: b.public() };
        assert_eq!(
            evaluate_roster(Some(&current), &merged, &from_member),
            Evaluation::Adopt
        );

        // Delivered by the unknown granter directly → rejected.
        let from_stranger = AdoptContext::Direct {
            from: granter.public(),
        };
        assert_eq!(
            evaluate_roster(Some(&current), &merged, &from_stranger),
            Evaluation::Unauthorized
        );

        // Family switches never come via gossip.
        let via_gossip = AdoptContext::Gossip { from: b.public() };
        assert_eq!(
            evaluate_roster(Some(&current), &merged, &via_gossip),
            Evaluation::Unauthorized
        );
    }
}
