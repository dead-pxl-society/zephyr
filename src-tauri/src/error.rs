use serde::{Serialize, ser::SerializeStruct};

#[derive(thiserror::Error, Debug)]
pub enum Error {
    #[error("Node not available")]
    NodeUnavailable,

    #[error("Notification failed: {0}")]
    Notification(String),

    #[error("Unknown peer")]
    UnknownPeer,

    #[error("Either endpoint_id or db_id must be provided")]
    MissingPeerIdentifier,

    #[error("Cannot add yourself as a contact")]
    SelfContact,

    #[error("Peer is already in your contacts")]
    AlreadyContact,

    #[error("Kick the device out of the family before blocking it")]
    BlockingOwnDevice,

    #[error("Invalid path: {0}")]
    InvalidPath(String),

    #[error("failed to get parent directory for path: {0}")]
    NoParentForPath(std::path::PathBuf),

    #[error("Stream ended without a tag")]
    NoTagForStream,

    #[error("Error importing {name}: {cause}")]
    AddItem { name: String, cause: String },

    #[error("Error exporting {name}: {cause}")]
    ExportItem { name: String, cause: String },

    #[error("Error receiving: {cause}")]
    ReceiveItem { cause: String },

    #[error("Target {0} already exists")]
    TargetExists(String),

    #[error("Window with label {0} not found")]
    NoWindowWithLabel(String),

    #[error("No notification settings screen available on this platform")]
    SettingsUnavailable,

    #[error("Error creating {0}")]
    StoreData(String),

    #[error("Shortcut error: {0}")]
    Shortcut(String),

    #[error("A device pairing is already in progress")]
    PairingInProgress,

    #[error("Pairing rejected: {0}")]
    PairingRejected(crate::net::proto::device::RejectReason),

    #[error("This device does not belong to a family")]
    NoFamily,

    #[error("Peer is not a member of this family")]
    NotAFamilyMember,

    #[error("Cannot kick this device, use leave_family instead")]
    CannotKickSelf,

    #[error("No family member is reachable")]
    NoMemberReachable,

    #[error("Invalid roster: {0}")]
    InvalidRoster(String),

    #[error("Roster signature verification failed")]
    RosterSignature,

    #[error("Clipboard payload could not be sealed or opened")]
    ClipboardCrypto,

    #[error("Config payload could not be sealed or opened")]
    ConfigCrypto,

    #[error("Device protocol violation: {0}")]
    DeviceProtocol(String),

    #[error("The share request is no longer pending")]
    ShareRequestExpired,

    #[error("The stored identity key is unreadable")]
    InvalidIdentityKey,

    #[error(transparent)]
    Io(#[from] std::io::Error),

    #[error[transparent]]
    EndpointBind(#[from] Box<iroh::endpoint::BindError>),

    #[error(transparent)]
    Anyhow(#[from] anyhow::Error),

    #[error(transparent)]
    Tauri(#[from] tauri::Error),

    #[error(transparent)]
    WalkDir(#[from] walkdir::Error),

    #[error(transparent)]
    PathStripPrefix(#[from] std::path::StripPrefixError),

    #[error(transparent)]
    EndpointConnect(#[from] iroh::endpoint::ConnectError),

    #[error(transparent)]
    EndpointConnection(#[from] iroh::endpoint::ConnectionError),

    #[error(transparent)]
    BlobsGet(#[from] Box<iroh_blobs::get::GetError>),

    #[error(transparent)]
    Clipboard(#[from] tauri_plugin_clipboard_manager::Error),

    #[error(transparent)]
    Opener(#[from] tauri_plugin_opener::Error),

    #[error(transparent)]
    TicketParse(#[from] iroh_tickets::ParseError),

    #[error(transparent)]
    Surreal(#[from] Box<surrealdb::Error>),

    #[error(transparent)]
    Postcard(#[from] postcard::Error),

    #[error(transparent)]
    ProtocolAccept(#[from] iroh::protocol::AcceptError),

    #[error(transparent)]
    EndpointClosedStream(#[from] iroh::endpoint::ClosedStream),

    #[error(transparent)]
    TokioJoin(#[from] tokio::task::JoinError),

    #[error(transparent)]
    Irpc(#[from] irpc::Error),

    #[error(transparent)]
    SurrealIdParse(#[from] surrealitos::SurrealIdParseError),

    #[error(transparent)]
    KeyParse(#[from] iroh::KeyParsingError),

    #[error(transparent)]
    RelayUrlParse(#[from] iroh::RelayUrlParseError),

    #[error(transparent)]
    N0Any(#[from] n0_error::AnyError),

    #[error(transparent)]
    IrohEndpoint(#[from] iroh::endpoint::EndpointError),

    #[error(transparent)]
    AddressLookupBuilder(#[from] iroh::address_lookup::AddressLookupBuilderError),

    #[error(transparent)]
    PoolConnect(#[from] iroh_util::connection_pool::PoolConnectError),

    #[error(transparent)]
    Timeout(#[from] tokio::time::error::Elapsed),

    #[error(transparent)]
    GossipApi(#[from] Box<iroh_gossip::api::ApiError>),

    #[error(transparent)]
    BlobsRequest(#[from] Box<iroh_blobs::api::RequestError>),

    #[error(transparent)]
    BlobsExportBao(#[from] Box<iroh_blobs::api::ExportBaoError>),
}

impl From<iroh_blobs::api::RequestError> for Error {
    fn from(err: iroh_blobs::api::RequestError) -> Self {
        Error::BlobsRequest(Box::new(err))
    }
}

impl From<iroh_blobs::api::ExportBaoError> for Error {
    fn from(err: iroh_blobs::api::ExportBaoError) -> Self {
        Error::BlobsExportBao(Box::new(err))
    }
}

impl From<iroh_gossip::api::ApiError> for Error {
    fn from(err: iroh_gossip::api::ApiError) -> Self {
        Error::GossipApi(Box::new(err))
    }
}

impl From<iroh::endpoint::BindError> for Error {
    fn from(err: iroh::endpoint::BindError) -> Self {
        Error::EndpointBind(Box::new(err))
    }
}

impl From<iroh_blobs::get::GetError> for Error {
    fn from(err: iroh_blobs::get::GetError) -> Self {
        Error::BlobsGet(Box::new(err))
    }
}

impl From<surrealdb::Error> for Error {
    fn from(err: surrealdb::Error) -> Self {
        Error::Surreal(Box::new(err))
    }
}

impl Error {
    /// Stable machine-readable code sent to the frontend alongside the message.
    /// The UI maps these to translated strings, so renaming one is a contract
    /// change; `generic` covers everything the UI has no specific wording for.
    pub fn code(&self) -> &'static str {
        match self {
            Error::NodeUnavailable => "node_unavailable",
            Error::UnknownPeer => "unknown_peer",
            Error::SelfContact => "self_contact",
            Error::AlreadyContact => "already_in_contacts",
            Error::BlockingOwnDevice => "blocking_own_device",
            Error::InvalidPath(_) => "invalid_path",
            Error::AddItem { .. } => "import_failed",
            Error::ExportItem { .. } => "export_failed",
            Error::ReceiveItem { .. } => "receive_failed",
            Error::TargetExists(_) => "target_exists",
            Error::SettingsUnavailable => "settings_unavailable",
            Error::Shortcut(_) => "shortcut",
            Error::PairingInProgress => "pairing_in_progress",
            Error::PairingRejected(_) => "pairing_rejected",
            Error::NoFamily => "no_family",
            Error::NotAFamilyMember => "not_a_family_member",
            Error::CannotKickSelf => "cannot_kick_self",
            Error::NoMemberReachable => "no_member_reachable",
            Error::ShareRequestExpired => "share_request_expired",
            Error::TicketParse(_) => "invalid_ticket",
            Error::Io(_) => "io",
            Error::Timeout(_)
            | Error::PoolConnect(_)
            | Error::EndpointConnect(_)
            | Error::EndpointConnection(_) => "peer_connection_timeout",
            _ => "generic",
        }
    }
}

impl Serialize for Error {
    fn serialize<S>(&self, serializer: S) -> std::result::Result<S::Ok, S::Error>
    where
        S: serde::ser::Serializer,
    {
        let mut state = serializer.serialize_struct("Error", 2)?;
        state.serialize_field("code", self.code())?;
        state.serialize_field("message", &self.to_string())?;
        state.end()
    }
}

pub type Result<T> = std::result::Result<T, Error>;
