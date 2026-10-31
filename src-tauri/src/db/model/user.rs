use async_trait::async_trait;
use iroh::PublicKey;
use serde::{Deserialize, Serialize};
use surrealdb::{
    Surreal,
    engine::local::Db,
    types::{Error as SurrealTypesError, Kind, Object, SurrealValue, Value},
};
use surrealitos::{Patch, SurrealId, extract_id};

use crate::{
    db::model::Controller,
    error::{Error, Result},
    util::device::Platform,
};

#[derive(Clone, Debug, Deserialize, Serialize, SurrealValue)]
#[serde(rename_all = "camelCase")]
#[surreal(untagged, rename_all = "camelCase")]
pub enum Language {
    En,
    Es,
    De,
    Fr,
    It,
    Pt,
    Ru,
    Ja,
    Ko,
    Zh,
}

#[cfg(target_os = "macos")]
const SHORTCUT_MODS: &str = "Ctrl+Super";
#[cfg(not(target_os = "macos"))]
const SHORTCUT_MODS: &str = "Ctrl+Alt";

fn default_share() -> String {
    format!("{SHORTCUT_MODS}+Z")
}

fn default_receive() -> String {
    format!("{SHORTCUT_MODS}+R")
}

fn default_accept() -> String {
    format!("{SHORTCUT_MODS}+A")
}

fn default_reject() -> String {
    format!("{SHORTCUT_MODS}+N")
}

fn default_true() -> bool {
    true
}

#[derive(Clone, Debug, Deserialize, Serialize, SurrealValue)]
pub struct ShortcutConfig {
    #[serde(default = "default_share")]
    #[surreal(default = "default_share")]
    pub share: String,
    #[serde(default = "default_receive")]
    #[surreal(default = "default_receive")]
    pub receive: String,
    #[serde(default = "default_accept")]
    #[surreal(default = "default_accept")]
    pub accept: String,
    #[serde(default = "default_reject")]
    #[surreal(default = "default_reject")]
    pub reject: String,
}

#[derive(Clone, Debug, Deserialize, Serialize, SurrealValue)]
pub struct ShortcutConfigPatch {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub share: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub receive: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub accept: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub reject: Option<String>,
}

#[derive(Clone, Copy, Debug, Deserialize, Serialize, PartialEq, Eq, SurrealValue)]
#[serde(rename_all = "kebab-case")]
#[surreal(untagged, rename_all = "kebab-case")]
pub enum OnboardingStep {
    Welcome,
    ShareShortcut,
    ShareShortcutLinux,
    AllShortcuts,
    PersonalDevices,
    Contacts,
    NotificationsAndSounds,
    Outro,
}

fn deserialize_step<'de, D>(
    deserializer: D,
) -> std::result::Result<Option<OnboardingStep>, D::Error>
where
    D: serde::Deserializer<'de>,
{
    use serde::de::IntoDeserializer;

    let raw = Option::<String>::deserialize(deserializer)?;

    Ok(raw.and_then(|value| {
        let step: serde::de::value::StringDeserializer<serde::de::value::Error> =
            value.into_deserializer();
        OnboardingStep::deserialize(step).ok()
    }))
}

#[derive(Clone, Debug, Default, Deserialize, Serialize)]
pub struct Onboarding {
    #[serde(default, deserialize_with = "deserialize_step")]
    pub step: Option<OnboardingStep>,
    #[serde(default)]
    pub completed: bool,
}

impl SurrealValue for Onboarding {
    fn kind_of() -> Kind {
        Kind::Object
    }

    fn is_value(value: &Value) -> bool {
        matches!(value, Value::Object(_))
    }

    fn into_value(self) -> Value {
        let mut object = Object::new();
        object.insert("step", self.step);
        object.insert("completed", self.completed);

        Value::Object(object)
    }

    fn from_value(value: Value) -> std::result::Result<Self, SurrealTypesError> {
        let Value::Object(mut object) = value else {
            return Err(SurrealTypesError::internal(format!(
                "Expected an object for onboarding, got {}",
                value.kind()
            )));
        };

        let step = object
            .remove("step")
            .and_then(|step| OnboardingStep::from_value(step).ok());
        let completed = object
            .remove("completed")
            .map(bool::from_value)
            .transpose()?
            .unwrap_or(false);

        Ok(Onboarding { step, completed })
    }
}

#[derive(Clone, Debug, Default, Deserialize, Serialize, SurrealValue)]
pub struct OnboardingPatch {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub step: Option<OnboardingStep>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub completed: Option<bool>,
}

// EndpointID is optional because we need User to initialize identity protocol and we can't get id earlier
#[derive(Clone, Debug, Deserialize, Serialize, SurrealValue)]
#[serde(rename_all(serialize = "camelCase"))]
pub struct User {
    pub id: SurrealId,
    #[surreal(wrap)]
    pub endpoint_id: Option<PublicKey>,
    pub name: String,
    pub platform: Platform,
    pub language: Option<Language>,

    #[serde(default)]
    #[surreal(default)]
    pub shortcuts: ShortcutConfig,

    #[serde(default = "default_true")]
    #[surreal(default = "default_true")]
    pub notifications: bool,
    #[serde(default = "default_true")]
    #[surreal(default = "default_true")]
    pub sounds: bool,

    #[serde(default)]
    #[surreal(default)]
    pub onboarding: Onboarding,
}

#[derive(Clone, Debug, Deserialize, Serialize, SurrealValue)]
pub struct NewUser {
    #[serde(skip_serializing_if = "Option::is_none")]
    #[surreal(wrap)]
    pub endpoint_id: Option<PublicKey>,
    pub name: String,
    pub platform: Platform,
}

#[derive(Clone, Debug, Default, Deserialize, Serialize, SurrealValue)]
pub struct UserPatch {
    #[serde(skip_serializing_if = "Option::is_none")]
    #[surreal(wrap)]
    pub endpoint_id: Option<PublicKey>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub name: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub platform: Option<Platform>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub language: Option<Language>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub shortcuts: Option<ShortcutConfigPatch>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub notifications: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub sounds: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub onboarding: Option<OnboardingPatch>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct SerializableUser {
    pub id: String,
    pub endpoint_id: Option<PublicKey>,
    pub name: String,
    pub platform: Platform,
}

impl Default for ShortcutConfig {
    fn default() -> Self {
        ShortcutConfig {
            share: default_share(),
            receive: default_receive(),
            accept: default_accept(),
            reject: default_reject(),
        }
    }
}

impl User {
    pub fn to_bytes(&self) -> Vec<u8> {
        let ser = SerializableUser {
            id: self.id.to_string(),
            endpoint_id: self.endpoint_id,
            name: self.name.clone(),
            platform: self.platform.clone(),
        };

        postcard::to_stdvec(&ser).expect("Failed to serialize user")
    }

    pub fn from_bytes(bytes: &[u8]) -> Result<Self> {
        let ser: SerializableUser = postcard::from_bytes(bytes)?;

        Ok(User {
            id: SurrealId::from(ser.id),
            endpoint_id: ser.endpoint_id,
            name: ser.name,
            platform: ser.platform,
            language: None,
            shortcuts: ShortcutConfig::default(),
            notifications: true,
            sounds: true,
            onboarding: Onboarding::default(),
        })
    }
}

pub struct UserController;

#[async_trait]
impl Controller<User, NewUser, UserPatch> for UserController {
    async fn get(db: &Surreal<Db>, id: &SurrealId) -> Result<Option<User>> {
        let mut results = db
            .query("SELECT * FROM ONLY $user")
            .bind(("user", id.clone().0))
            .await?;

        let user: Option<User> = results.take(0)?;
        Ok(user)
    }

    async fn update(db: &Surreal<Db>, id: &str, user_patch: &UserPatch) -> Result<User> {
        let user_id = extract_id(id, "user");

        let user_opt: Option<User> = db
            .update(("user", user_id))
            .merge(Patch(user_patch.clone()))
            .await?;
        let user = user_opt.ok_or(Error::StoreData("user".to_string()))?;
        Ok(user)
    }

    async fn create(db: &Surreal<Db>, new_user: &NewUser) -> Result<User> {
        let user: Option<User> = db.create("user").content(Patch(new_user.clone())).await?;
        user.ok_or(Error::StoreData("user".to_string()))
    }

    async fn delete(db: &Surreal<Db>, id: &SurrealId) -> Result<Option<User>> {
        db.query("DELETE user WHERE id = $id RETURN NONE")
            .bind(("id", id.clone().0))
            .await?;

        Ok(None)
    }
}

impl UserController {
    // pub async fn get_by_endpoint_id(
    //     db: &Surreal<Db>,
    //     endpoint_id: PublicKey,
    // ) -> Result<Option<User>> {
    //     let mut results = db
    //         .query("SELECT * FROM user WHERE endpoint_id = $endpoint_id")
    //         .bind(("endpoint_id", endpoint_id))
    //         .await?;

    //     let user: Option<User> = results.take(0)?;
    //     Ok(user)
    // }

    pub async fn get_one(db: &Surreal<Db>) -> Result<Option<User>> {
        let mut results = db.query("SELECT * FROM user LIMIT 1").await?;

        let user: Option<User> = results.take(0)?;
        Ok(user)
    }
}
