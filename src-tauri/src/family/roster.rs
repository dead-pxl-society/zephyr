use iroh::{PublicKey, SecretKey, Signature};
use iroh_tickets::endpoint::EndpointTicket;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};

use crate::{
    error::{Error, Result},
    util::device::Platform,
};

const ROSTER_SIGN_DOMAIN: &[u8] = b"zephyr/roster/0";

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct RosterMember {
    pub endpoint_id: PublicKey,
    pub name: String,
    pub platform: Platform,
    pub ticket: EndpointTicket,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct RosterDoc {
    pub version: u8,
    pub family_id: [u8; 32],
    pub epoch: u64,
    /// Canonical form: sorted by endpoint id bytes. `SignedRoster::sign` enforces this;
    /// verification recomputes the digest over the bytes as-received, so a reordered
    /// roster fails signature verification.
    pub members: Vec<RosterMember>,
    pub author: PublicKey,
    pub issued_at_ms: u64,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct SignedRoster {
    pub doc: RosterDoc,
    pub signature: Signature,
}

impl RosterDoc {
    fn canonicalize(&mut self) {
        self.members
            .sort_by(|a, b| a.endpoint_id.as_bytes().cmp(b.endpoint_id.as_bytes()));
    }

    fn digest(&self) -> Result<[u8; 32]> {
        let mut hasher = Sha256::new();
        hasher.update(ROSTER_SIGN_DOMAIN);
        hasher.update(postcard::to_stdvec(self)?);
        Ok(hasher.finalize().into())
    }
}

impl SignedRoster {
    pub fn sign(mut doc: RosterDoc, key: &SecretKey) -> Result<Self> {
        doc.canonicalize();
        let signature = key.sign(&doc.digest()?);
        Ok(Self { doc, signature })
    }

    pub fn verify(&self) -> Result<()> {
        self.doc
            .author
            .verify(&self.doc.digest()?, &self.signature)
            .map_err(|_| Error::RosterSignature)
    }

    /// Stable hash of the signed roster, used as the deterministic tiebreak
    /// when two rosters share an epoch.
    pub fn hash(&self) -> Result<[u8; 32]> {
        let mut hasher = Sha256::new();
        hasher.update(postcard::to_stdvec(self)?);
        Ok(hasher.finalize().into())
    }

    pub fn contains(&self, endpoint_id: &PublicKey) -> bool {
        self.member(endpoint_id).is_some()
    }

    pub fn member(&self, endpoint_id: &PublicKey) -> Option<&RosterMember> {
        self.doc
            .members
            .iter()
            .find(|m| &m.endpoint_id == endpoint_id)
    }

    pub fn member_ids(&self) -> Vec<PublicKey> {
        self.doc.members.iter().map(|m| m.endpoint_id).collect()
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

    fn member(key: &SecretKey) -> RosterMember {
        let endpoint_id = key.public();
        RosterMember {
            endpoint_id,
            name: format!("device-{}", &endpoint_id.to_string()[..6]),
            platform: Platform::Macos,
            ticket: EndpointTicket::from(iroh::EndpointAddr::from(endpoint_id)),
        }
    }

    fn doc(author: &SecretKey, members: Vec<RosterMember>, epoch: u64) -> RosterDoc {
        RosterDoc {
            version: 0,
            family_id: [7u8; 32],
            epoch,
            members,
            author: author.public(),
            issued_at_ms: 0,
        }
    }

    #[test]
    fn sign_and_verify_roundtrip() {
        let a = SecretKey::generate();
        let b = SecretKey::generate();
        let roster = SignedRoster::sign(doc(&a, vec![member(&a), member(&b)], 1), &a).unwrap();
        roster.verify().unwrap();

        let bytes = roster.to_bytes().unwrap();
        let decoded = SignedRoster::from_bytes(&bytes).unwrap();
        decoded.verify().unwrap();
        assert_eq!(decoded.hash().unwrap(), roster.hash().unwrap());
    }

    #[test]
    fn canonical_sort_makes_member_order_irrelevant() {
        let a = SecretKey::generate();
        let b = SecretKey::generate();
        let r1 = SignedRoster::sign(doc(&a, vec![member(&a), member(&b)], 1), &a).unwrap();
        let r2 = SignedRoster::sign(doc(&a, vec![member(&b), member(&a)], 1), &a).unwrap();
        assert_eq!(r1.doc.members[0].endpoint_id, r2.doc.members[0].endpoint_id);
    }

    #[test]
    fn tampered_roster_fails_verification() {
        let a = SecretKey::generate();
        let b = SecretKey::generate();
        let mut roster = SignedRoster::sign(doc(&a, vec![member(&a)], 1), &a).unwrap();
        roster.doc.members.push(member(&b));
        assert!(roster.verify().is_err());
    }

    #[test]
    fn wrong_author_fails_verification() {
        let a = SecretKey::generate();
        let mallory = SecretKey::generate();
        let unsigned = doc(&a, vec![member(&a)], 1);
        let forged = SignedRoster::sign(unsigned, &mallory).unwrap();
        // signature is valid for mallory's key, but the doc claims `a` as author
        assert!(forged.verify().is_err());
    }
}
