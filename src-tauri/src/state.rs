use std::sync::{
    Arc, OnceLock,
    atomic::{AtomicBool, AtomicU64, Ordering},
};

use dashmap::DashMap;
use surrealdb::{Surreal, engine::local::Db};
use tokio::sync::{mpsc, oneshot};

use crate::{
    clipboard::ClipboardWrite,
    error::{Error, Result},
    family::runtime::FamilyRuntime,
    net::node::Node,
    util::{file::SelectionHash, parcel_cache::ParcelCache, peer_cache::PeerCache},
};

pub const DEFAULT_CLIPBOARD_MAX_BYTES: u64 = 25 * 1024 * 1024;

pub type ShareRequestMap = DashMap<usize, oneshot::Sender<bool>>;
pub type DeviceInviteMap = DashMap<usize, oneshot::Sender<bool>>;

/// Shared application state. The node is set exactly once during setup and is
/// never locked afterwards: every protocol handle inside it is cheaply cloneable,
/// so callers clone what they need and must never hold anything across I/O.
pub struct AppState {
    pub db: Surreal<Db>,
    pub node: OnceLock<Arc<Node>>,
    pub peer_cache: Arc<PeerCache>,
    pub parcel_cache: Arc<ParcelCache>,
    pub share_requests: ShareRequestMap,
    pub device_invites: DeviceInviteMap,
    pub family: OnceLock<Arc<FamilyRuntime>>,
    pub last_selection_hash: std::sync::Mutex<SelectionHash>,
    pub last_clipboard: std::sync::Mutex<Option<(u128, u64)>>,
    pub clipboard_sync: AtomicBool,
    pub clipboard_files: AtomicBool,
    pub clipboard_max_bytes: AtomicU64,
    pub clipboard_writer: OnceLock<mpsc::UnboundedSender<ClipboardWrite>>,
}

impl AppState {
    pub(crate) fn new(db: Surreal<Db>) -> Self {
        AppState {
            peer_cache: Arc::new(PeerCache::new(db.clone())),
            db,
            node: OnceLock::new(),
            parcel_cache: Arc::new(ParcelCache::new()),
            share_requests: DashMap::new(),
            device_invites: DashMap::new(),
            family: OnceLock::new(),
            last_selection_hash: std::sync::Mutex::new(SelectionHash::ZERO),
            last_clipboard: std::sync::Mutex::new(None),
            clipboard_sync: AtomicBool::new(true),
            clipboard_files: AtomicBool::new(false),
            clipboard_max_bytes: AtomicU64::new(DEFAULT_CLIPBOARD_MAX_BYTES),
            clipboard_writer: OnceLock::new(),
        }
    }

    pub fn set_node(&self, node: Arc<Node>) {
        let _ = self.node.set(node);
    }

    pub fn node(&self) -> Result<Arc<Node>> {
        self.node.get().cloned().ok_or(Error::NodeUnavailable)
    }

    pub(crate) fn db(&self) -> &Surreal<Db> {
        &self.db
    }

    pub fn peer_cache(&self) -> Arc<PeerCache> {
        Arc::clone(&self.peer_cache)
    }

    pub fn share_requests(&self) -> &ShareRequestMap {
        &self.share_requests
    }

    pub fn device_invites(&self) -> &DeviceInviteMap {
        &self.device_invites
    }

    pub fn set_family_runtime(&self, runtime: Arc<FamilyRuntime>) {
        let _ = self.family.set(runtime);
    }

    pub fn family_runtime(&self) -> Option<Arc<FamilyRuntime>> {
        self.family.get().cloned()
    }

    pub fn set_last_selection_hash(&self, hash: SelectionHash) {
        let mut guard = self.last_selection_hash.lock().unwrap();
        *guard = hash;
    }

    pub fn last_selection_hash(&self) -> SelectionHash {
        *self.last_selection_hash.lock().unwrap()
    }

    pub fn parcel_cache(&self) -> Arc<ParcelCache> {
        Arc::clone(&self.parcel_cache)
    }

    pub fn set_last_clipboard(&self, entry: Option<(u128, u64)>) {
        *self.last_clipboard.lock().unwrap() = entry;
    }

    pub fn last_clipboard(&self) -> Option<(u128, u64)> {
        *self.last_clipboard.lock().unwrap()
    }

    pub fn try_replace_last_clipboard(
        &self,
        expected: Option<(u128, u64)>,
        new: Option<(u128, u64)>,
    ) -> bool {
        let mut guard = self.last_clipboard.lock().unwrap();
        if *guard != expected {
            return false;
        }
        *guard = new;
        true
    }

    pub fn set_clipboard_sync(&self, enabled: bool) {
        self.clipboard_sync.store(enabled, Ordering::Relaxed);
    }

    pub fn clipboard_sync(&self) -> bool {
        self.clipboard_sync.load(Ordering::Relaxed)
    }

    pub fn set_clipboard_files(&self, enabled: bool) {
        self.clipboard_files.store(enabled, Ordering::Relaxed);
    }

    pub fn clipboard_files(&self) -> bool {
        self.clipboard_files.load(Ordering::Relaxed)
    }

    pub fn set_clipboard_max_bytes(&self, max: u64) {
        self.clipboard_max_bytes.store(max, Ordering::Relaxed);
    }

    pub fn clipboard_max_bytes(&self) -> u64 {
        self.clipboard_max_bytes.load(Ordering::Relaxed)
    }

    pub fn set_clipboard_writer(&self, tx: mpsc::UnboundedSender<ClipboardWrite>) {
        let _ = self.clipboard_writer.set(tx);
    }

    pub fn write_clipboard(&self, write: ClipboardWrite) -> bool {
        self.clipboard_writer
            .get()
            .is_some_and(|tx| tx.send(write).is_ok())
    }
}
