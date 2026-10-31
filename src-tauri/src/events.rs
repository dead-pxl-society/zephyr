use iroh::PublicKey;
use serde::{Deserialize, Serialize};
use serde_json::Value;

use crate::{
    net::proto::{
        device::DevicePeerInfo,
        share::{PeerInfo, ShareInfo},
    },
    util::peer_cache::EphemeralPeer,
};

#[derive(Clone, Debug, Deserialize, Serialize)]
pub struct BlobConnectionEvent {
    pub endpoint_id: String,
    pub connection_id: u64,
    pub connected: bool,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all(serialize = "camelCase"))]
pub enum SendEventType {
    Started,
    Progress,
    Completed,
    Aborted,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all(serialize = "camelCase"))]
pub struct SendProgressEvent {
    #[serde(alias = "type", rename = "type")]
    pub event_type: SendEventType,
    pub connection_id: u64,
    pub request_id: u64,
    pub endpoint_id: String,
    pub size: Option<u64>,
    pub progress: Option<u64>,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all(serialize = "camelCase"))]
pub enum PeerDiscoveryType {
    Discovered,
    Expired,
    Enriched,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all(serialize = "camelCase"))]
pub struct PeerDiscoveryEvent {
    #[serde(alias = "type", rename = "type")]
    pub event_type: PeerDiscoveryType,
    pub peer: EphemeralPeer,
    #[serde(alias = "lastSeen")]
    pub last_seen: Option<u64>,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all(serialize = "camelCase"))]
pub struct ShareRequest {
    pub(crate) peer: PeerInfo,
    pub(crate) info: ShareInfo,
    pub(crate) request_id: usize,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all(serialize = "camelCase"))]
pub enum ShareResponseType {
    Accepted,
    Rejected,
    Cancelled,
    Timeout,
    /// The receiver does not know us yet (never discovered or added us).
    Unknown,
}

/// Importing the selected files failed before a ticket could be produced.
#[derive(Debug, Serialize)]
#[serde(rename_all(serialize = "camelCase"))]
pub struct ImportErrorEvent {
    pub(crate) parcel_id: usize,
    pub(crate) error: crate::error::Error,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all(serialize = "camelCase"))]
pub struct ShareResponse {
    #[serde(alias = "type", rename = "type")]
    pub(crate) response_type: ShareResponseType,
    pub(crate) endpoint_id: PublicKey,
    pub(crate) request_id: usize,
}

#[derive(Clone, Serialize)]
#[serde(rename_all(serialize = "camelCase"))]
pub struct DeviceInviteRequest {
    pub(crate) session_id: usize,
    pub(crate) peer: DevicePeerInfo,
    pub(crate) code: String,
}

#[derive(Clone, Serialize)]
#[serde(rename_all(serialize = "camelCase"))]
pub enum DevicePairingType {
    Code,
    Completed,
    /// Unexpected breakage; `reason` is a debug string, not for display.
    Failed,
    /// A user said no; `reason` is a stable `RejectReason` code.
    Rejected,
    Cancelled,
}

#[derive(Clone, Serialize)]
#[serde(rename_all(serialize = "camelCase"))]
pub struct DevicePairingEvent {
    #[serde(rename = "type")]
    pub(crate) event_type: DevicePairingType,
    pub(crate) session_id: usize,
    pub(crate) peer: Option<DevicePeerInfo>,
    pub(crate) code: Option<String>,
    pub(crate) reason: Option<String>,
}

#[derive(Clone, Serialize)]
#[serde(rename_all(serialize = "camelCase"))]
pub enum FamilyLeftReason {
    Kicked,
    Left,
    Dissolved,
}

#[derive(Clone, Serialize)]
#[serde(rename_all(serialize = "camelCase"))]
pub struct FamilyLeftEvent {
    pub(crate) reason: FamilyLeftReason,
}

#[derive(Clone, Serialize)]
#[serde(rename_all(serialize = "camelCase"))]
pub enum DevicePresenceType {
    Online,
    Offline,
}

#[derive(Clone, Serialize)]
#[serde(rename_all(serialize = "camelCase"))]
pub struct DevicePresenceEvent {
    #[serde(rename = "type")]
    pub(crate) event_type: DevicePresenceType,
    pub(crate) endpoint_id: PublicKey,
}

#[derive(Clone, Serialize)]
#[serde(rename_all(serialize = "camelCase"))]
pub struct NotificationEvent {
    pub(crate) title: String,
    pub(crate) body: Option<String>,
    pub(crate) sound: Option<String>,
    /// Interpolation values for the i18n keys in `title`/`body`. Must be a JSON
    /// object, e.g. `json!({ "peer": name })` for `"{{peer}} sent you some files"`.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) args: Option<Value>,
}
