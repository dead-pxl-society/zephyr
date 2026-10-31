use iroh::PublicKey;
use serde::{Deserialize, Serialize};
use surrealdb::{
    Surreal,
    engine::local::Db,
    types::{Datetime, SurrealValue},
};
use surrealitos::{Patch, SurrealId, extract_id};

use crate::{
    error::{Error, Result},
    family::roster::SignedRoster,
};

/// Forwarding record kept after a merge so devices of the absorbed family
/// that were offline during the merge can still sync into the new family.
#[derive(Clone, Debug, Deserialize, Serialize, SurrealValue)]
#[serde(rename_all(serialize = "camelCase"))]
pub struct PreviousFamily {
    pub family_id: String, // hex [u8; 32]
    #[surreal(wrap)]
    pub members: Vec<PublicKey>,
    #[serde(default)]
    #[surreal(default)]
    pub merged_at_ms: u64,
}

/// Singleton row describing this device's family membership.
/// The roster is stored as hex-encoded postcard bytes so the ed25519
/// signature survives SurrealDB serialization untouched.
#[derive(Clone, Debug, Deserialize, Serialize, SurrealValue)]
#[serde(rename_all(serialize = "camelCase"))]
pub struct Family {
    pub id: SurrealId,
    pub created_at: Datetime,
    pub updated_at: Datetime,

    pub family_id: String,    // hex [u8; 32], stable public identity
    pub epoch: u64,           // monotonic, bumps on every membership change
    pub epoch_secret: String, // hex [u8; 32], fresh random every epoch
    pub roster: String,       // hex postcard SignedRoster

    #[serde(default)]
    #[surreal(default)]
    pub previous_families: Vec<PreviousFamily>,
    #[serde(default)]
    #[surreal(default, wrap)]
    pub pending_epoch_pushes: Vec<PublicKey>,
    #[serde(default)]
    #[surreal(default, wrap)]
    pub pending_kicks: Vec<PublicKey>,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
pub struct FamilyState {
    pub family_id: [u8; 32],
    pub epoch: u64,
    pub epoch_secret: [u8; 32],
    pub roster: SignedRoster,
}

#[derive(Clone, Debug, Serialize, Deserialize, Default, SurrealValue)]
pub struct FamilyPatch {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub previous_families: Option<Vec<PreviousFamily>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    #[surreal(wrap)]
    pub pending_epoch_pushes: Option<Vec<PublicKey>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    #[surreal(wrap)]
    pub pending_kicks: Option<Vec<PublicKey>>,
}

fn decode_32(hex_str: &str, what: &str) -> Result<[u8; 32]> {
    let bytes = hex::decode(hex_str).map_err(|_| Error::InvalidRoster(what.to_string()))?;
    bytes
        .try_into()
        .map_err(|_| Error::InvalidRoster(what.to_string()))
}

impl Family {
    pub fn signed_roster(&self) -> Result<SignedRoster> {
        let bytes =
            hex::decode(&self.roster).map_err(|_| Error::InvalidRoster("roster".to_string()))?;
        SignedRoster::from_bytes(&bytes)
    }

    pub fn family_id_bytes(&self) -> Result<[u8; 32]> {
        decode_32(&self.family_id, "family_id")
    }

    pub fn epoch_secret_bytes(&self) -> Result<[u8; 32]> {
        decode_32(&self.epoch_secret, "epoch_secret")
    }

    pub fn state(&self) -> Result<FamilyState> {
        Ok(FamilyState {
            family_id: self.family_id_bytes()?,
            epoch: self.epoch,
            epoch_secret: self.epoch_secret_bytes()?,
            roster: self.signed_roster()?,
        })
    }
}

#[derive(Clone, Debug, Serialize, SurrealValue)]
struct FamilyContent {
    family_id: String,
    epoch: u64,
    epoch_secret: String,
    roster: String,
    created_at: Datetime,
    updated_at: Datetime,
}

#[derive(Clone, Debug, Serialize, SurrealValue)]
struct FamilyStateMerge {
    family_id: String,
    epoch: u64,
    epoch_secret: String,
    roster: String,
    updated_at: Datetime,
}

pub struct FamilyController;

impl FamilyController {
    pub async fn get_one(db: &Surreal<Db>) -> Result<Option<Family>> {
        let mut results = db.query("SELECT * FROM family LIMIT 1").await?;
        let family: Option<Family> = results.take(0)?;
        Ok(family)
    }

    /// Create or replace the singleton family row with new membership state.
    /// Queues (`pending_*`) and `previous_families` are preserved on update.
    pub async fn set_state(db: &Surreal<Db>, state: &FamilyState) -> Result<Family> {
        let roster_hex = hex::encode(state.roster.to_bytes()?);
        let family_hex = hex::encode(state.family_id);
        let secret_hex = hex::encode(state.epoch_secret);

        let existing = Self::get_one(db).await?;
        let family = match existing {
            Some(row) => {
                let merge = FamilyStateMerge {
                    family_id: family_hex,
                    epoch: state.epoch,
                    epoch_secret: secret_hex,
                    roster: roster_hex,
                    updated_at: Datetime::default(),
                };
                let updated: Option<Family> = db
                    .update(("family", extract_id(&row.id.to_string(), "family")))
                    .merge(merge)
                    .await?;
                updated.ok_or(Error::StoreData("family".to_string()))?
            }
            None => {
                let content = FamilyContent {
                    family_id: family_hex,
                    epoch: state.epoch,
                    epoch_secret: secret_hex,
                    roster: roster_hex,
                    created_at: Datetime::default(),
                    updated_at: Datetime::default(),
                };
                let created: Option<Family> = db.create("family").content(content).await?;
                created.ok_or(Error::StoreData("family".to_string()))?
            }
        };

        Ok(family)
    }

    pub async fn patch(db: &Surreal<Db>, id: &SurrealId, patch: &FamilyPatch) -> Result<Family> {
        let updated: Option<Family> = db
            .update(("family", extract_id(&id.to_string(), "family")))
            .merge(Patch(patch.clone()))
            .await?;
        updated.ok_or(Error::StoreData("family".to_string()))
    }

    pub async fn delete_all(db: &Surreal<Db>) -> Result<()> {
        db.query("DELETE family RETURN NONE").await?;
        Ok(())
    }
}
