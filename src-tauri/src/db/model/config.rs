use std::cmp::Ordering;

use iroh::PublicKey;
use serde::{Deserialize, Serialize};
use surrealdb::{
    Surreal,
    engine::local::Db,
    types::{Datetime, SurrealValue},
};
use surrealitos::{SurrealId, extract_id};

use crate::{
    error::{Error, Result},
    family::gossip::next_stamp,
    state::DEFAULT_CLIPBOARD_MAX_BYTES,
};

pub const KEY_CLIPBOARD_SYNC: &str = "clipboard.sync";
pub const KEY_CLIPBOARD_FILES: &str = "clipboard.files";
pub const KEY_CLIPBOARD_MAX_BYTES: &str = "clipboard.maxBytes";

#[derive(Clone, Debug, PartialEq, Deserialize, Serialize)]
pub enum ConfigValue {
    Bool(bool),
    U64(u64),
    Text(String),
}

impl ConfigValue {
    pub fn encode(&self) -> Vec<u8> {
        postcard::to_stdvec(self).expect("config value is always serializable")
    }

    pub fn decode(bytes: &[u8]) -> Option<Self> {
        postcard::from_bytes(bytes).ok()
    }

    pub fn as_bool(&self) -> Option<bool> {
        match self {
            Self::Bool(value) => Some(*value),
            _ => None,
        }
    }

    pub fn as_u64(&self) -> Option<u64> {
        match self {
            Self::U64(value) => Some(*value),
            _ => None,
        }
    }
}

#[derive(Clone, Debug, PartialEq, Deserialize, Serialize)]
pub struct ConfigEntry {
    pub key: String,
    pub value: Vec<u8>,
    pub stamp: u64,
    pub author: PublicKey,
}

impl ConfigEntry {
    pub fn supersedes(&self, other: &ConfigEntry) -> bool {
        match self.stamp.cmp(&other.stamp) {
            Ordering::Greater => true,
            Ordering::Less => false,
            Ordering::Equal => self.author.as_bytes() < other.author.as_bytes(),
        }
    }

    pub fn decoded(&self) -> Option<ConfigValue> {
        ConfigValue::decode(&self.value)
    }
}

#[derive(Clone, Debug, Default)]
pub struct ConfigState {
    pub entries: Vec<ConfigEntry>,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ConfigView {
    pub clipboard_sync: bool,
    pub clipboard_files: bool,
    pub clipboard_max_bytes: u64,
}

impl ConfigState {
    pub fn get(&self, key: &str) -> Option<ConfigValue> {
        self.entries.iter().find(|e| e.key == key)?.decoded()
    }

    pub fn clipboard_sync(&self) -> bool {
        self.get(KEY_CLIPBOARD_SYNC)
            .and_then(|v| v.as_bool())
            .unwrap_or(true)
    }

    pub fn clipboard_files(&self) -> bool {
        self.get(KEY_CLIPBOARD_FILES)
            .and_then(|v| v.as_bool())
            .unwrap_or(false)
    }

    pub fn clipboard_max_bytes(&self) -> u64 {
        self.get(KEY_CLIPBOARD_MAX_BYTES)
            .and_then(|v| v.as_u64())
            .unwrap_or(DEFAULT_CLIPBOARD_MAX_BYTES)
    }

    pub fn view(&self) -> ConfigView {
        ConfigView {
            clipboard_sync: self.clipboard_sync(),
            clipboard_files: self.clipboard_files(),
            clipboard_max_bytes: self.clipboard_max_bytes(),
        }
    }

    pub fn max_stamp(&self) -> Option<u64> {
        self.entries.iter().map(|e| e.stamp).max()
    }

    pub fn set(&mut self, key: &str, value: ConfigValue, author: PublicKey) -> ConfigEntry {
        let entry = ConfigEntry {
            key: key.to_string(),
            value: value.encode(),
            stamp: next_stamp(self.max_stamp()),
            author,
        };

        self.merge(std::slice::from_ref(&entry));
        entry
    }

    pub fn merge(&mut self, incoming: &[ConfigEntry]) -> Vec<String> {
        let mut changed = Vec::new();

        for entry in incoming {
            match self.entries.iter_mut().find(|e| e.key == entry.key) {
                Some(local) => {
                    if entry.supersedes(local) {
                        *local = entry.clone();
                        changed.push(entry.key.clone());
                    }
                }
                None => {
                    self.entries.push(entry.clone());
                    changed.push(entry.key.clone());
                }
            }
        }

        if !changed.is_empty() {
            self.entries.sort_by(|a, b| a.key.cmp(&b.key));
        }

        changed
    }
}

#[derive(Clone, Debug, Deserialize, Serialize, SurrealValue)]
#[serde(rename_all(serialize = "camelCase"))]
pub struct StoredEntry {
    pub key: String,
    pub value: String,
    pub stamp: u64,
    #[surreal(wrap)]
    pub author: PublicKey,
}

#[derive(Clone, Debug, Deserialize, Serialize, SurrealValue)]
#[serde(rename_all(serialize = "camelCase"))]
pub struct Config {
    pub id: SurrealId,
    pub created_at: Datetime,
    pub updated_at: Datetime,

    #[serde(default)]
    #[surreal(default)]
    pub entries: Vec<StoredEntry>,
}

impl Config {
    pub fn state(&self) -> ConfigState {
        let entries = self
            .entries
            .iter()
            .filter_map(|stored| {
                Some(ConfigEntry {
                    key: stored.key.clone(),
                    value: hex::decode(&stored.value).ok()?,
                    stamp: stored.stamp,
                    author: stored.author,
                })
            })
            .collect();

        ConfigState { entries }
    }
}

fn to_stored(state: &ConfigState) -> Vec<StoredEntry> {
    state
        .entries
        .iter()
        .map(|entry| StoredEntry {
            key: entry.key.clone(),
            value: hex::encode(&entry.value),
            stamp: entry.stamp,
            author: entry.author,
        })
        .collect()
}

#[derive(Clone, Debug, Serialize, SurrealValue)]
struct ConfigContent {
    entries: Vec<StoredEntry>,
    created_at: Datetime,
    updated_at: Datetime,
}

#[derive(Clone, Debug, Serialize, SurrealValue)]
struct ConfigMerge {
    entries: Vec<StoredEntry>,
    updated_at: Datetime,
}

pub struct ConfigController;

impl ConfigController {
    pub async fn get_one(db: &Surreal<Db>) -> Result<Option<Config>> {
        let mut results = db.query("SELECT * FROM config LIMIT 1").await?;
        let config: Option<Config> = results.take(0)?;
        Ok(config)
    }

    pub async fn state(db: &Surreal<Db>) -> Result<ConfigState> {
        Ok(Self::get_one(db)
            .await?
            .map(|row| row.state())
            .unwrap_or_default())
    }

    pub async fn set_state(db: &Surreal<Db>, state: &ConfigState) -> Result<Config> {
        let entries = to_stored(state);

        let config = match Self::get_one(db).await? {
            Some(row) => {
                let merge = ConfigMerge {
                    entries,
                    updated_at: Datetime::default(),
                };
                let updated: Option<Config> = db
                    .update(("config", extract_id(&row.id.to_string(), "config")))
                    .merge(merge)
                    .await?;
                updated.ok_or(Error::StoreData("config".to_string()))?
            }
            None => {
                let content = ConfigContent {
                    entries,
                    created_at: Datetime::default(),
                    updated_at: Datetime::default(),
                };
                let created: Option<Config> = db.create("config").content(content).await?;
                created.ok_or(Error::StoreData("config".to_string()))?
            }
        };

        Ok(config)
    }
}
