use std::sync::Arc;

use dashmap::DashMap;
use iroh::{Endpoint, PublicKey, address_lookup::memory::MemoryLookup};
use iroh_blobs::{
    HashAndFormat,
    api::{TempTag, blobs::ExportMode, blobs::ExportOptions},
    format::collection::Collection,
};
use iroh_gossip::{
    TopicId,
    api::{Event, GossipReceiver, GossipSender},
    net::Gossip,
};
use n0_future::StreamExt;
use surrealdb::{Surreal, engine::local::Db};
use tauri::{Emitter, Manager};
use tokio::sync::Mutex;
use tokio_util::sync::CancellationToken;

use crate::{
    clipboard::{CLIP_DIR_PREFIX, ClipboardRead, ClipboardWrite, clip_content_id, clip_dir_name},
    db::{
        api::config::publish_config,
        model::{
            config::{ConfigController, ConfigEntry},
            family::{FamilyController, FamilyPatch, FamilyState},
        },
    },
    error::{Error, Result},
    events::{DevicePresenceEvent, DevicePresenceType, FamilyLeftEvent, FamilyLeftReason},
    family::{
        AdoptContext, Evaluation, apply_state, evaluate_roster, family_topic, generate_secret,
        gossip::{
            ClipboardBody, FamilyGossip, GossipPayload, Sealed, next_stamp, open_clipboard,
            open_config, seal_clipboard, seal_config, should_apply,
        },
        now_ms,
        roster::{RosterDoc, SignedRoster},
        wipe_family,
    },
    net::{
        node::ClipboardBlobs,
        proto::device::{DeviceProtocol, SyncOutcome},
        util::{get_export_path, paths_to_data_sources},
    },
    state::AppState,
    util::peer_cache::refresh_nearby,
};

const HEARTBEAT_INTERVAL: std::time::Duration = std::time::Duration::from_secs(30);
/// A member is considered offline after this long without a Hello/Heartbeat.
const PRESENCE_TTL_MS: u64 = 90_000;

/// After a manual rejoin, how long members get to answer before the ones
/// that were online and stayed silent are reported offline.
const REFRESH_PRESENCE_GRACE: std::time::Duration = std::time::Duration::from_secs(5);
const MAINTENANCE_INTERVAL: std::time::Duration = std::time::Duration::from_secs(60);

const MAX_INLINE_CLIPBOARD_BYTES: usize = 60_000;
const CLIP_TAG_RETENTION: usize = 2;

struct TopicHandle {
    sender: GossipSender,
    cancel: CancellationToken,
    topic_id: TopicId,
    epoch_secret: [u8; 32],
}

/// Owns the family gossip topic: joins/rotates it as epochs change, tracks
/// member presence via heartbeats, and runs background anti-entropy.
/// Lives outside the `Mutex<Option<Node>>` so presence never contends with
/// the node lock.
pub struct FamilyRuntime {
    app: tauri::AppHandle,
    db: Surreal<Db>,
    gossip: Gossip,
    endpoint: Endpoint,
    device: DeviceProtocol,
    memory_lookup: MemoryLookup,
    user_name: String,
    topic: Mutex<Option<TopicHandle>>,
    presence: DashMap<PublicKey, u64>, // last heard, ms since epoch
    clip: ClipboardBlobs,
    clip_tags: Mutex<Vec<TempTag>>,
}

impl FamilyRuntime {
    #[allow(clippy::too_many_arguments)]
    pub fn new(
        app: tauri::AppHandle,
        db: Surreal<Db>,
        gossip: Gossip,
        endpoint: Endpoint,
        device: DeviceProtocol,
        memory_lookup: MemoryLookup,
        user_name: String,
        clip: ClipboardBlobs,
    ) -> Arc<Self> {
        Arc::new(Self {
            app,
            db,
            gossip,
            endpoint,
            device,
            memory_lookup,
            user_name,
            topic: Mutex::new(None),
            presence: DashMap::new(),
            clip,
            clip_tags: Mutex::new(Vec::new()),
        })
    }

    /// Startup sequence: join the gossip topic for the persisted state right
    /// away so presence is visible as soon as peers answer, then run
    /// anti-entropy (catch up on epochs missed while offline, or learn we were
    /// kicked). Dialing offline members costs a connect timeout each, which is
    /// why the sync must not gate the join. Then keep a maintenance loop running.
    pub async fn startup(self: Arc<Self>) {
        if let Ok(Some(_)) = FamilyController::get_one(&self.db).await {
            if let Err(e) = self.ensure_topic().await {
                eprintln!("[family] failed to join topic: {e}");
            }

            if self.sync_with_any_member().await {
                self.leave_topic(false).await;
            } else {
                if let Err(e) = self.ensure_topic().await {
                    eprintln!("[family] failed to rotate topic after sync: {e}");
                }

                self.sync_config_with_members().await;
            }
        }

        self.maintenance_loop().await;
    }

    pub fn endpoint_id(&self) -> PublicKey {
        self.endpoint.id()
    }

    /// Try members until one answers conclusively. Returns true when the sync
    /// discovered we were removed from the family.
    async fn sync_with_any_member(&self) -> bool {
        let Ok(Some(row)) = FamilyController::get_one(&self.db).await else {
            return false;
        };
        let Ok(state) = row.state() else {
            return false;
        };

        // Startup calls this before ensure_topic has seeded the address book;
        // without the roster tickets, members can only be dialed by bare id.
        self.seed_lookup(&state.roster);

        let self_id = self.endpoint.id();
        for member in state.roster.member_ids() {
            if member == self_id {
                continue;
            }

            match self.device.sync_with(member).await {
                Ok(SyncOutcome::Removed) => {
                    eprintln!("[family] sync with {member}: we were removed from the family");
                    return true;
                }
                Ok(SyncOutcome::Adopted) => {
                    eprintln!("[family] sync with {member}: adopted newer epoch");
                    return false;
                }
                Ok(SyncOutcome::UpToDate) => return false,
                Ok(SyncOutcome::Unknown) => {
                    eprintln!("[family] sync with {member}: inconclusive");
                    continue;
                }
                Err(e) => {
                    eprintln!("[family] sync with {member} failed: {e}");
                    continue;
                }
            }
        }

        false
    }

    /// Periodic background work: retry queued epoch pushes and make sure the
    /// topic matches the persisted family state (self-heals missed rotations).
    async fn maintenance_loop(self: Arc<Self>) {
        let mut ticker = tokio::time::interval(MAINTENANCE_INTERVAL);
        // The first tick fires immediately; skip it, startup just ran.
        ticker.tick().await;

        loop {
            ticker.tick().await;

            let Ok(row_opt) = FamilyController::get_one(&self.db).await else {
                continue;
            };
            let Some(row) = row_opt else {
                let _ = self.leave_topic(false).await;
                continue;
            };

            let Ok(state) = row.state() else { continue };

            // Anti-entropy every tick, not just at startup: the boot-time sync
            // often runs before the network is ready, and a kick that missed
            // its live delivery must still converge.
            if self.sync_with_any_member().await {
                self.leave_topic(false).await;
                continue;
            }

            for member in row.pending_epoch_pushes.clone() {
                if let Err(e) = self.device.push_epoch(member, &state).await {
                    eprintln!("[family] epoch push retry to {member} failed: {e}");
                }
            }

            if let Err(e) = self.ensure_topic().await {
                eprintln!("[family] topic maintenance failed: {e}");
            }

            // Sleep/wake can leave the swarm silently dead: stream open, zero
            // neighbors, so ensure_topic sees a healthy handle. If the roster
            // has other members but we've heard nobody, force a resubscribe to
            // re-bootstrap from the roster tickets.
            if state.roster.doc.members.len() > 1 && self.presence.is_empty() {
                eprintln!("[family] no members heard from, re-bootstrapping gossip topic");
                self.leave_topic(false).await;
                if let Err(e) = self.ensure_topic().await {
                    eprintln!("[family] re-bootstrap failed: {e}");
                }
            }

            self.sync_config_with_members().await;

            self.settle_pending_kicks(&row.pending_kicks).await;
            self.prune_previous_families(&row).await;
        }
    }

    /// Merge forwarding records only need to live long enough for absorbed
    /// devices to come online and sync; drop them after 90 days.
    async fn prune_previous_families(&self, row: &crate::db::model::family::Family) {
        const PREVIOUS_FAMILY_TTL_MS: u64 = 90 * 24 * 60 * 60 * 1000;

        let now = now_ms();
        let kept: Vec<_> = row
            .previous_families
            .iter()
            .filter(|p| now.saturating_sub(p.merged_at_ms) < PREVIOUS_FAMILY_TTL_MS)
            .cloned()
            .collect();

        if kept.len() != row.previous_families.len() {
            let patch = FamilyPatch {
                previous_families: Some(kept),
                ..Default::default()
            };
            let _ = FamilyController::patch(&self.db, &row.id, &patch).await;
        }
    }

    /// A concurrent same-epoch roster race can undo a kick (the losing kick's
    /// target reappears in the winning roster). Re-execute those; clear kicks
    /// that stuck once every member has the epoch.
    async fn settle_pending_kicks(self: &Arc<Self>, pending: &[PublicKey]) {
        if pending.is_empty() {
            return;
        }

        let Ok(Some(row)) = FamilyController::get_one(&self.db).await else {
            return;
        };
        let Ok(state) = row.state() else { return };

        let mut remaining = Vec::new();
        for target in pending {
            if state.roster.contains(target) {
                remaining.push(*target);
                let _ = self.kick(*target).await;
            } else if !row.pending_epoch_pushes.is_empty() {
                // Kick stands but not everyone has heard; keep tracking.
                remaining.push(*target);
            }
        }

        if remaining.len() != pending.len() {
            let patch = FamilyPatch {
                pending_kicks: Some(remaining),
                ..Default::default()
            };
            let _ = FamilyController::patch(&self.db, &row.id, &patch).await;
        }
    }

    /// Join (or rotate to) the topic for the current persisted family state.
    /// Idempotent: a handle already on the right topic is left alone.
    pub async fn ensure_topic(self: &Arc<Self>) -> Result<()> {
        let Some(row) = FamilyController::get_one(&self.db).await? else {
            self.leave_topic(false).await;
            return Ok(());
        };
        let state = row.state()?;

        let topic_id = family_topic(&state.family_id, state.epoch, &state.epoch_secret);

        {
            let guard = self.topic.lock().await;
            if let Some(handle) = guard.as_ref()
                && handle.topic_id == topic_id
            {
                return Ok(());
            }
        }

        self.seed_lookup(&state.roster);

        let self_id = self.endpoint.id();
        let bootstrap: Vec<PublicKey> = state
            .roster
            .member_ids()
            .into_iter()
            .filter(|id| *id != self_id)
            .collect();

        eprintln!(
            "[family] joining topic {} (epoch {}, {} bootstrap peers)",
            topic_id,
            state.epoch,
            bootstrap.len()
        );
        let topic = self.gossip.subscribe(topic_id, bootstrap).await?;
        let (sender, receiver) = topic.split();
        let cancel = CancellationToken::new();

        let handle = TopicHandle {
            sender: sender.clone(),
            cancel: cancel.clone(),
            topic_id,
            epoch_secret: state.epoch_secret,
        };

        {
            let mut guard = self.topic.lock().await;
            if let Some(old) = guard.take() {
                old.cancel.cancel();
            }
            *guard = Some(handle);
        }

        let epoch = state.epoch;
        tokio::spawn(
            self.clone()
                .run_topic(receiver, sender.clone(), cancel, topic_id, state),
        );

        self.broadcast_on(&sender, &topic_id, self.hello_payload(epoch))
            .await;

        Ok(())
    }

    pub async fn leave_topic(&self, goodbye: bool) {
        let handle = { self.topic.lock().await.take() };

        if let Some(handle) = handle {
            if goodbye {
                self.broadcast_on(&handle.sender, &handle.topic_id, GossipPayload::Goodbye)
                    .await;
            }
            handle.cancel.cancel();
        }

        self.presence.clear();
    }

    /// React to a newly adopted roster (pairing, epoch push, sync): rotate the
    /// gossip topic and refresh the address book.
    pub async fn on_state_changed(self: &Arc<Self>) {
        if let Err(e) = self.ensure_topic().await {
            eprintln!("[family] failed to rotate topic: {e}");
        }
    }

    pub async fn on_revoked(&self) {
        self.leave_topic(false).await;
    }

    /// Manual recovery: drop the gossip topic and join it again on fresh
    /// connections, then catch up with members and settings. Presence is
    /// kept as the UI last saw it until members have had a chance to answer,
    /// so devices that are still there never blink offline.
    pub async fn refresh(self: &Arc<Self>) {
        if !matches!(FamilyController::get_one(&self.db).await, Ok(Some(_))) {
            return;
        }

        let previously_online: Vec<PublicKey> =
            self.presence.iter().map(|entry| *entry.key()).collect();

        self.leave_topic(false).await;
        if let Err(e) = self.ensure_topic().await {
            eprintln!("[family] failed to rejoin topic on refresh: {e}");
        }

        let runtime = self.clone();
        tokio::spawn(async move {
            if runtime.sync_with_any_member().await {
                runtime.leave_topic(false).await;
                return;
            }
            if let Err(e) = runtime.ensure_topic().await {
                eprintln!("[family] failed to rotate topic after refresh sync: {e}");
            }
            runtime.sync_config_with_members().await;
        });

        let runtime = self.clone();
        tokio::spawn(async move {
            tokio::time::sleep(REFRESH_PRESENCE_GRACE).await;

            for endpoint_id in previously_online {
                if !runtime.is_online(&endpoint_id) {
                    let event = DevicePresenceEvent {
                        event_type: DevicePresenceType::Offline,
                        endpoint_id,
                    };
                    let _ = runtime.app.emit("device_presence", event);
                }
            }

            runtime.emit_family_updated().await;
        });
    }

    pub fn is_online(&self, endpoint_id: &PublicKey) -> bool {
        self.presence
            .get(endpoint_id)
            .map(|last| now_ms().saturating_sub(*last) < PRESENCE_TTL_MS)
            .unwrap_or(false)
    }

    fn hello_payload(&self, epoch: u64) -> GossipPayload {
        GossipPayload::Hello {
            name: self.user_name.clone(),
            platform: crate::util::device::get_platform(),
            epoch,
        }
    }

    fn seed_lookup(&self, roster: &SignedRoster) {
        let self_id = self.endpoint.id();
        for member in &roster.doc.members {
            if member.endpoint_id != self_id {
                self.memory_lookup
                    .add_endpoint_info(member.ticket.endpoint_addr().clone());
            }
        }
    }

    async fn broadcast_on(
        &self,
        sender: &GossipSender,
        topic_id: &TopicId,
        payload: GossipPayload,
    ) {
        let Ok(msg) = FamilyGossip::sign(payload, topic_id, self.endpoint.secret_key()) else {
            return;
        };
        let Ok(bytes) = msg.to_bytes() else { return };
        let _ = sender.broadcast(bytes.into()).await;
    }

    /// Broadcast a local clipboard change to the family. No-op when the content is what
    /// we already hold, which is what stops an echo of our own write.
    pub async fn broadcast_clipboard(&self, read: ClipboardRead) {
        let Some(app_state) = self.app.try_state::<AppState>() else {
            return;
        };

        // Files we materialised ourselves, still sitting in the clip directory we wrote.
        // Recognising the directory is cheaper and far more reliable than trying to
        // predict what `get_files` would hand back after `set_files`.
        if let ClipboardRead::Files(paths) = &read
            && let Some(id) = clip_content_id(paths)
            && app_state
                .last_clipboard()
                .is_some_and(|(last_id, _)| last_id == id)
        {
            return;
        }

        let body = match self.build_clipboard_body(read, &app_state).await {
            Ok(Some(body)) => body,
            Ok(None) => return,
            Err(e) => {
                eprintln!("[clipboard] failed to prepare payload: {e}");
                return;
            }
        };

        let content_id = body.content_id();
        let last = app_state.last_clipboard();
        if last.is_some_and(|(last_id, _)| last_id == content_id) {
            return;
        }

        let stamp = next_stamp(last.map(|(_, last_stamp)| last_stamp));

        let handle = self.topic.lock().await;
        let Some(handle) = handle.as_ref() else {
            return;
        };

        let payload = match seal_clipboard(&body, stamp, &handle.epoch_secret) {
            Ok(payload) => payload,
            Err(e) => {
                eprintln!("[clipboard] failed to seal payload: {e}");
                return;
            }
        };

        app_state.set_last_clipboard(Some((content_id, stamp)));
        self.broadcast_on(&handle.sender, &handle.topic_id, payload)
            .await;
    }

    pub async fn broadcast_config(&self, entries: &[ConfigEntry]) {
        if entries.is_empty() {
            return;
        }

        let handle = self.topic.lock().await;
        let Some(handle) = handle.as_ref() else {
            return;
        };

        let payload = match seal_config(entries, &handle.epoch_secret) {
            Ok(payload) => payload,
            Err(e) => {
                eprintln!("[config] failed to seal payload: {e}");
                return;
            }
        };

        self.broadcast_on(&handle.sender, &handle.topic_id, payload)
            .await;
    }

    async fn apply_config(&self, sealed: &Sealed, epoch_secret: &[u8; 32]) {
        let entries = match open_config(sealed, epoch_secret) {
            Ok(entries) => entries,
            Err(e) => {
                eprintln!("[config] failed to open payload: {e}");
                return;
            }
        };

        let Ok(mut config) = ConfigController::state(&self.db).await else {
            return;
        };

        if config.merge(&entries).is_empty() {
            return;
        }

        if let Err(e) = ConfigController::set_state(&self.db, &config).await {
            eprintln!("[config] failed to persist merged config: {e}");
            return;
        }

        publish_config(&self.app, &config);
    }

    async fn sync_config_with_members(&self) {
        let Ok(Some(row)) = FamilyController::get_one(&self.db).await else {
            return;
        };
        let Ok(state) = row.state() else { return };

        let self_id = self.endpoint.id();
        for member in state.roster.member_ids() {
            if member == self_id {
                continue;
            }

            if let Err(e) = self.device.sync_config_with(member).await {
                eprintln!("[config] sync with {member} failed: {e}");
            }
        }
    }

    fn spawn_config_sync(&self, member: PublicKey) {
        let device = self.device.clone();
        tokio::spawn(async move {
            if let Err(e) = device.sync_config_with(member).await {
                eprintln!("[config] sync with {member} failed: {e}");
            }
        });
    }

    async fn build_clipboard_body(
        &self,
        read: ClipboardRead,
        app_state: &AppState,
    ) -> Result<Option<ClipboardBody>> {
        let max_bytes = app_state.clipboard_max_bytes();

        match read {
            ClipboardRead::Text(text) => {
                if text.len() as u64 > max_bytes {
                    eprintln!(
                        "[clipboard] skipping {} byte copy, limit is {max_bytes}",
                        text.len()
                    );
                    return Ok(None);
                }

                if text.len() <= MAX_INLINE_CLIPBOARD_BYTES {
                    return Ok(Some(ClipboardBody::Text(text)));
                }

                let size = text.len() as u64;
                let tag = self.clip.store.add_bytes(text).temp_tag().await?;
                let hash = tag.hash();
                self.retain_clip_tag(tag).await;

                Ok(Some(ClipboardBody::BlobText { hash, size }))
            }
            ClipboardRead::Files(paths) => {
                if !app_state.clipboard_files() {
                    return Ok(None);
                }

                // Size has to be settled before importing, not after: one copied folder
                // in Finder is a single path that `paths_to_data_sources` will walk into
                // tens of gigabytes.
                let sources = paths_to_data_sources(&paths)?;
                if sources.is_empty() {
                    eprintln!("[clipboard] nothing to send: no regular files in selection");
                    return Ok(None);
                }

                let mut total_size = 0u64;
                for (_, path) in &sources {
                    total_size += tokio::fs::metadata(path).await?.len();
                    if total_size > max_bytes {
                        eprintln!(
                            "[clipboard] skipping copy over {max_bytes} bytes, not importing"
                        );
                        return Ok(None);
                    }
                }

                let names: Vec<String> = sources.iter().map(|(name, _)| name.clone()).collect();

                let mut collection = Collection::default();
                for (name, path) in sources {
                    let tag = self.clip.store.add_path(path).temp_tag().await?;
                    collection.push(name, tag.hash());
                    self.retain_clip_tag(tag).await;
                }

                let tag = collection.store(&self.clip.store).await?;
                let hash = tag.hash();
                self.retain_clip_tag(tag).await;

                Ok(Some(ClipboardBody::Files {
                    hash,
                    total_size,
                    names,
                }))
            }
        }
    }

    /// Bounded because the clipboard store is in memory: this is the memory ceiling.
    async fn retain_clip_tag(&self, tag: TempTag) {
        let mut tags = self.clip_tags.lock().await;
        tags.push(tag);
        while tags.len() > CLIP_TAG_RETENTION {
            let _ = tags.remove(0);
        }
    }

    async fn apply_clipboard(
        &self,
        from: PublicKey,
        stamp: u64,
        sealed: &Sealed,
        secret: &[u8; 32],
    ) {
        let Some(app_state) = self.app.try_state::<AppState>() else {
            return;
        };
        if !app_state.clipboard_sync() {
            return;
        }

        let last = app_state.last_clipboard();
        if last.is_some_and(|(_, last_stamp)| stamp <= last_stamp) {
            return;
        }

        let body = match open_clipboard(sealed, secret) {
            Ok(body) => body,
            Err(e) => {
                eprintln!("[clipboard] failed to open payload: {e}");
                return;
            }
        };

        let content_id = body.content_id();
        if !should_apply(last, content_id, stamp) {
            return;
        }

        if let ClipboardBody::Text(text) = body {
            app_state.set_last_clipboard(Some((content_id, stamp)));
            if !app_state.write_clipboard(ClipboardWrite::Text(text)) {
                app_state.set_last_clipboard(None);
            }
            return;
        }

        let write = match self
            .fetch_clipboard_body(from, &body, content_id, &app_state)
            .await
        {
            Ok(Some(write)) => write,
            Ok(None) => return,
            Err(e) => {
                eprintln!("[clipboard] failed to fetch payload from {from}: {e}");
                return;
            }
        };

        // Only claim the slot if nothing newer landed during the fetch, or we would
        // overwrite the user's fresher copy with content that is already stale.
        if !app_state.try_replace_last_clipboard(last, Some((content_id, stamp))) {
            eprintln!("[clipboard] superseded during fetch, discarding");
            return;
        }

        if !app_state.write_clipboard(write) {
            app_state.try_replace_last_clipboard(Some((content_id, stamp)), last);
        }
    }

    async fn fetch_clipboard_body(
        &self,
        from: PublicKey,
        body: &ClipboardBody,
        content_id: u128,
        app_state: &AppState,
    ) -> Result<Option<ClipboardWrite>> {
        let max_bytes = app_state.clipboard_max_bytes();

        match body {
            ClipboardBody::Text(_) => Ok(None),

            ClipboardBody::BlobText { hash, size } => {
                if *size > max_bytes {
                    eprintln!("[clipboard] declining {size} byte text, local limit is {max_bytes}");
                    return Ok(None);
                }

                let conn = self.clip.pool.get_or_connect(from).await?;
                self.clip
                    .store
                    .remote()
                    .fetch((*conn).clone(), HashAndFormat::raw(*hash))
                    .await?;

                let bytes = self.clip.store.get_bytes(*hash).await?;
                let text = String::from_utf8(bytes.to_vec()).map_err(|_| Error::ClipboardCrypto)?;

                Ok(Some(ClipboardWrite::Text(text)))
            }

            ClipboardBody::Files {
                hash, total_size, ..
            } => {
                if !app_state.clipboard_files() {
                    return Ok(None);
                }
                if *total_size > max_bytes {
                    eprintln!(
                        "[clipboard] declining {total_size} byte copy, local limit is {max_bytes}"
                    );
                    return Ok(None);
                }

                let conn = self.clip.pool.get_or_connect(from).await?;
                self.clip
                    .store
                    .remote()
                    .fetch((*conn).clone(), HashAndFormat::hash_seq(*hash))
                    .await?;

                let collection = Collection::load(*hash, &*self.clip.store).await?;

                let root = self.app.path().temp_dir()?.join(clip_dir_name(content_id));
                tokio::fs::create_dir_all(&root).await?;

                let mut written = Vec::new();
                for (name, hash) in collection.iter() {
                    // Peer-supplied name; `get_export_path` keeps it inside `root`.
                    let target = get_export_path(&root, name)?;
                    if let Some(parent) = target.parent() {
                        tokio::fs::create_dir_all(parent).await?;
                    }

                    self.clip
                        .store
                        .export_with_opts(ExportOptions {
                            hash: *hash,
                            target: target.clone(),
                            mode: ExportMode::Copy,
                        })
                        .await?;

                    written.push(target);
                }

                self.prune_clip_dirs(&root).await;

                Ok(Some(ClipboardWrite::Files(written)))
            }
        }
    }

    async fn prune_clip_dirs(&self, keep: &std::path::Path) {
        let Ok(temp_dir) = self.app.path().temp_dir() else {
            return;
        };
        let Ok(mut entries) = tokio::fs::read_dir(&temp_dir).await else {
            return;
        };

        while let Ok(Some(entry)) = entries.next_entry().await {
            let path = entry.path();
            if path == keep {
                continue;
            }
            if entry
                .file_name()
                .to_str()
                .is_some_and(|name| name.starts_with(CLIP_DIR_PREFIX))
            {
                let _ = tokio::fs::remove_dir_all(&path).await;
            }
        }
    }

    fn mark_online(&self, endpoint_id: PublicKey) {
        let now = now_ms();
        let was_online = self.is_online(&endpoint_id);
        self.presence.insert(endpoint_id, now);

        if !was_online {
            eprintln!("[family] emitting device_presence online for {endpoint_id}");
            let event = DevicePresenceEvent {
                event_type: DevicePresenceType::Online,
                endpoint_id,
            };
            let _ = self.app.emit("device_presence", event);
        }
    }

    fn mark_offline(&self, endpoint_id: &PublicKey) {
        if self.presence.remove(endpoint_id).is_some() {
            let event = DevicePresenceEvent {
                event_type: DevicePresenceType::Offline,
                endpoint_id: *endpoint_id,
            };
            let _ = self.app.emit("device_presence", event);
        }
    }

    fn sweep_presence(&self) {
        let now = now_ms();
        let expired: Vec<PublicKey> = self
            .presence
            .iter()
            .filter(|entry| now.saturating_sub(*entry.value()) >= PRESENCE_TTL_MS)
            .map(|entry| *entry.key())
            .collect();

        for id in expired {
            self.mark_offline(&id);
        }
    }

    /// Receiver loop for one topic incarnation. Ends on cancel (rotation or
    /// leave) or when the gossip stream closes.
    pub(crate) async fn run_topic(
        self: Arc<Self>,
        mut receiver: GossipReceiver,
        sender: GossipSender,
        cancel: CancellationToken,
        topic_id: TopicId,
        state: FamilyState,
    ) {
        let mut heartbeat = tokio::time::interval(HEARTBEAT_INTERVAL);

        loop {
            tokio::select! {
                _ = cancel.cancelled() => break,

                _ = heartbeat.tick() => {
                    self.broadcast_on(&sender, &topic_id, GossipPayload::Heartbeat).await;
                    self.sweep_presence();
                }

                event = receiver.next() => {
                    match event {
                        None | Some(Err(_)) => break,
                        Some(Ok(event)) => {
                            self.handle_event(event, &sender, &topic_id, &state).await;
                        }
                    }
                }
            }
        }

        // Stream death (sleep/wake, network loss) is not a rotation: the stale
        // handle would make ensure_topic think we're still joined. Drop it so
        // the maintenance loop rejoins on its next tick (≤60s).
        if !cancel.is_cancelled() {
            eprintln!("[family] gossip stream closed for topic {topic_id}, will rejoin");
            let mut guard = self.topic.lock().await;
            if guard.as_ref().is_some_and(|h| h.topic_id == topic_id) {
                *guard = None;
            }
        }
    }

    async fn handle_event(
        self: &Arc<Self>,
        event: Event,
        sender: &GossipSender,
        topic_id: &TopicId,
        state: &FamilyState,
    ) {
        match event {
            Event::NeighborUp(id) => {
                eprintln!(
                    "[family] neighbor up: {} (in roster: {})",
                    id,
                    state.roster.contains(&id)
                );
                if state.roster.contains(&id) {
                    self.mark_online(id);
                    self.spawn_config_sync(id);
                }
                // Introduce ourselves so the newcomer marks us online quickly.
                self.broadcast_on(sender, topic_id, self.hello_payload(state.epoch))
                    .await;
            }
            // Liveness comes from heartbeat expiry: a lost direct neighbor may
            // still be reachable through the swarm.
            Event::NeighborDown(_) => {}
            Event::Lagged => {
                self.broadcast_on(sender, topic_id, self.hello_payload(state.epoch))
                    .await;
            }
            Event::Received(message) => {
                let Ok(msg) = FamilyGossip::from_bytes(&message.content) else {
                    eprintln!("[family] received undecodable gossip message");
                    return;
                };
                let Ok((from, payload)) = msg.verify(topic_id) else {
                    eprintln!("[family] gossip message failed signature/topic verification");
                    return;
                };
                if !state.roster.contains(&from) {
                    eprintln!("[family] gossip from non-roster member {from}");
                    return;
                }
                eprintln!("[family] gossip from {from}: {payload:?}");

                match payload {
                    GossipPayload::Hello {
                        epoch: their_epoch, ..
                    } => {
                        self.mark_online(from);
                        if their_epoch > state.epoch {
                            self.spawn_sync(from);
                        }
                    }
                    GossipPayload::Heartbeat => self.mark_online(from),
                    GossipPayload::Goodbye => self.mark_offline(&from),
                    GossipPayload::MembershipChanged { roster: new_roster } => {
                        self.mark_online(from);
                        // Pre-screen with the shared acceptance rule; the
                        // secret never rides gossip, so adoption itself
                        // happens over a direct sync.
                        let ctx = AdoptContext::Gossip { from };
                        if evaluate_roster(Some(state), &new_roster, &ctx) == Evaluation::Adopt {
                            self.spawn_sync(from);
                        }
                    }
                    GossipPayload::Clipboard { stamp, sealed } => {
                        self.mark_online(from);
                        let runtime = self.clone();
                        let secret = state.epoch_secret;
                        tokio::spawn(async move {
                            runtime.apply_clipboard(from, stamp, &sealed, &secret).await;
                        });
                    }
                    GossipPayload::Config { sealed } => {
                        self.mark_online(from);
                        self.apply_config(&sealed, &state.epoch_secret).await;
                    }
                }
            }
        }
    }

    fn spawn_sync(&self, member: PublicKey) {
        let device = self.device.clone();
        tokio::spawn(async move {
            let _ = device.sync_with(member).await;
        });
    }

    /// Sign a roster containing `members` at the next epoch, with a fresh
    /// secret.
    fn next_state(
        &self,
        current: &FamilyState,
        members: Vec<crate::family::roster::RosterMember>,
    ) -> Result<FamilyState> {
        let doc = RosterDoc {
            version: 0,
            family_id: current.family_id,
            epoch: current.epoch + 1,
            members,
            author: self.endpoint.id(),
            issued_at_ms: now_ms(),
        };
        let roster = SignedRoster::sign(doc, self.endpoint.secret_key())?;

        Ok(FamilyState {
            family_id: current.family_id,
            epoch: current.epoch + 1,
            epoch_secret: generate_secret(),
            roster,
        })
    }

    /// Announce a new epoch on the CURRENT (old) topic so online members sync
    /// immediately. A kicked device seeing its own removal here is fine — it
    /// cannot derive the new topic without the secret.
    async fn announce_membership_change(&self, roster: SignedRoster) {
        let handle = self.topic.lock().await;
        if let Some(handle) = handle.as_ref() {
            self.broadcast_on(
                &handle.sender,
                &handle.topic_id,
                GossipPayload::MembershipChanged { roster },
            )
            .await;
        }
    }

    /// Kick a device: rotate to a fresh epoch + secret the target never sees.
    pub async fn kick(self: &Arc<Self>, target: PublicKey) -> Result<()> {
        let self_id = self.endpoint.id();
        if target == self_id {
            return Err(Error::CannotKickSelf);
        }

        let row = FamilyController::get_one(&self.db)
            .await?
            .ok_or(Error::NoFamily)?;
        let state = row.state()?;

        if !state.roster.contains(&target) {
            return Err(Error::NotAFamilyMember);
        }

        let members = state
            .roster
            .doc
            .members
            .iter()
            .filter(|m| m.endpoint_id != target)
            .cloned()
            .collect();
        let new_state = self.next_state(&state, members)?;

        // Persist state + retry queues BEFORE any network send, so a crash
        // right after the kick still converges once we come back.
        apply_state(&self.db, &new_state, self_id).await?;

        let others: Vec<PublicKey> = new_state
            .roster
            .member_ids()
            .into_iter()
            .filter(|id| *id != self_id)
            .collect();

        eprintln!(
            "[family] kicking {target}: epoch {} -> {}",
            state.epoch, new_state.epoch
        );

        let mut pending_kicks = row.pending_kicks.clone();
        if !pending_kicks.contains(&target) {
            pending_kicks.push(target);
        }
        let patch = FamilyPatch {
            pending_epoch_pushes: Some(others.clone()),
            pending_kicks: Some(pending_kicks),
            ..Default::default()
        };
        FamilyController::patch(&self.db, &row.id, &patch).await?;

        self.mark_offline(&target);

        // Fast path for online members.
        self.announce_membership_change(new_state.roster.clone())
            .await;

        // Courtesy notice; the offline-kick case is covered by sync refusal.
        // The target's address must survive in the lookup until this dial has
        // been attempted, so it is only removed afterwards.
        let device = self.device.clone();
        let family_id = new_state.family_id;
        let memory_lookup = self.memory_lookup.clone();
        tokio::spawn(async move {
            match device.revoke(target, family_id).await {
                Ok(()) => eprintln!("[family] revoke notice delivered to {target}"),
                Err(e) => eprintln!("[family] revoke notice to {target} failed: {e}"),
            }
            memory_lookup.remove_endpoint_info(target);
        });

        if let Err(e) = self.ensure_topic().await {
            eprintln!("[family] failed to rotate topic after kick: {e}");
        }

        for member in others {
            let device = self.device.clone();
            let push_state = new_state.clone();
            tokio::spawn(async move {
                let _ = device.push_epoch(member, &push_state).await;
            });
        }

        self.emit_family_updated().await;

        Ok(())
    }

    /// Leave the family voluntarily. Unless `force`, at least one member must
    /// receive the new roster so the family knows we are gone.
    pub async fn leave(self: &Arc<Self>, force: bool) -> Result<()> {
        let self_id = self.endpoint.id();
        let row = FamilyController::get_one(&self.db)
            .await?
            .ok_or(Error::NoFamily)?;
        let state = row.state()?;

        let others: Vec<PublicKey> = state
            .roster
            .member_ids()
            .into_iter()
            .filter(|id| *id != self_id)
            .collect();

        // Last member: dissolving, nobody to notify.
        if others.is_empty() {
            self.leave_topic(true).await;
            wipe_family(&self.db).await?;
            refresh_nearby(&self.app).await;
            let _ = self.app.emit(
                "family_left",
                FamilyLeftEvent {
                    reason: FamilyLeftReason::Dissolved,
                },
            );
            return Ok(());
        }

        let members = state
            .roster
            .doc
            .members
            .iter()
            .filter(|m| m.endpoint_id != self_id)
            .cloned()
            .collect();
        let new_state = self.next_state(&state, members)?;

        let mut delivered = 0usize;
        for member in &others {
            if self.device.push_epoch(*member, &new_state).await.is_ok() {
                delivered += 1;
            }
        }

        if delivered == 0 && !force {
            return Err(Error::NoMemberReachable);
        }

        self.announce_membership_change(new_state.roster.clone())
            .await;
        self.leave_topic(true).await;
        wipe_family(&self.db).await?;
        refresh_nearby(&self.app).await;

        let _ = self.app.emit(
            "family_left",
            FamilyLeftEvent {
                reason: FamilyLeftReason::Left,
            },
        );

        Ok(())
    }

    async fn emit_family_updated(&self) {
        refresh_nearby(&self.app).await;

        if let Ok(Some(view)) = crate::family::api::build_family_view(&self.app).await {
            let _ = self.app.emit("family_updated", view);
        }
    }
}
