use std::{
    collections::BTreeMap,
    path::{Path, PathBuf},
    sync::{
        Arc,
        atomic::{AtomicU64, Ordering},
    },
};

use iroh_blobs::{
    api::{
        blobs::{ExportMode, ExportOptions, ExportProgressItem},
        remote::GetProgressItem,
    },
    format::collection::Collection,
    get::request::get_hash_seq_and_sizes,
    store::fs::FsStore,
    ticket::BlobTicket,
};
use iroh_util::connection_pool::ConnectionPool;
use n0_future::{FuturesUnordered, StreamExt};
use serde::Serialize;
use tokio::sync::{Semaphore, mpsc};

use crate::{
    error::{Error, Result},
    net::util::{get_export_path, validate_path_component},
};

use super::proto::share::PeerInfo;

static NEXT_TRANSFER_ID: AtomicU64 = AtomicU64::new(1);

pub fn next_transfer_id() -> u64 {
    NEXT_TRANSFER_ID.fetch_add(1, Ordering::Relaxed)
}

#[derive(Debug, Serialize, Eq, PartialEq)]
#[serde(rename_all(serialize = "camelCase"))]
pub enum GetEventType {
    /// Emitted before any network activity so the UI can show the transfer
    /// immediately; `Started` follows once sizes are known.
    Connecting,
    Started,
    Progress,
    Done,
    Error,
}

#[derive(Debug, Serialize)]
#[serde(rename_all(serialize = "camelCase"))]
pub struct GetProgressEvent {
    #[serde(alias = "type", rename = "type")]
    pub event_type: GetEventType,
    pub progress: Option<u64>,
    pub total_size: Option<u64>,
    pub total_files: Option<u64>,
    pub transfer_id: u64,
    pub from: Option<PeerInfo>,
    pub ticket: Option<String>,
    pub error: Option<String>,
}

#[derive(Debug, Serialize, Eq, PartialEq)]
#[serde(rename_all(serialize = "camelCase"))]
pub enum ExportEventType {
    Size,
    Progress,
    Done,
    Finished,
    Error,
}

#[derive(Debug, Serialize)]
#[serde(rename_all(serialize = "camelCase"))]
pub struct ExportEvent {
    #[serde(alias = "type", rename = "type")]
    pub event_type: ExportEventType,
    pub transfer_id: u64,
    pub name: String,
    pub size: Option<u64>,
    pub progress: Option<u64>,
    pub error: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub paths: Option<Vec<String>>,
}

#[derive(Debug)]
pub struct PerConnectionProgress {
    pub endpoint_id: String,
    pub requests: BTreeMap<u64, ()>,
}

fn resolve_unique_export_path(root: &Path, name: &str, max_attempts: u32) -> Result<PathBuf> {
    let base_path = get_export_path(root, name)?;

    if !base_path.exists() {
        return Ok(base_path);
    }

    let file_name = base_path
        .file_name()
        .and_then(|f| f.to_str())
        .ok_or_else(|| Error::InvalidPath(name.into()))?;

    let stem = Path::new(file_name)
        .file_stem()
        .and_then(|s| s.to_str())
        .ok_or_else(|| Error::InvalidPath(name.into()))?;

    let ext = Path::new(file_name).extension().and_then(|e| e.to_str());

    let parent = base_path
        .parent()
        .ok_or_else(|| Error::InvalidPath(name.into()))?;

    for i in 1..=max_attempts {
        let candidate_name = match ext {
            Some(ext) => format!("{stem} ({i}).{ext}"),
            None => format!("{stem} ({i})"),
        };

        validate_path_component(&candidate_name)?;

        let candidate = parent.join(&candidate_name);
        if !candidate.exists() {
            return Ok(candidate);
        }
    }

    Err(Error::TargetExists(format!(
        "Could not find available filename for {name} after {max_attempts} attempts"
    )))
}

pub(crate) async fn export(
    store: Arc<FsStore>,
    collection: Collection,
    root: PathBuf,
    transfer_id: u64,
    tx: mpsc::UnboundedSender<ExportEvent>,
) -> Result<()> {
    let semaphore = Arc::new(Semaphore::new(2));

    let mut tasks = FuturesUnordered::new();

    for (name, hash) in collection.iter() {
        let store = store.clone();
        let root = root.clone();
        let name = name.clone();
        let hash = *hash;
        let permit = semaphore.clone().acquire_owned().await.unwrap();

        let tx = tx.clone();
        tasks.push(tokio::spawn(async move {
            let _permit = permit;

            let target = resolve_unique_export_path(&root, &name, 64)?;
            let target_path = target.to_string_lossy().to_string();

            let mut stream = store
                .export_with_opts(ExportOptions {
                    hash,
                    target,
                    mode: ExportMode::TryReference,
                })
                .stream()
                .await;

            while let Some(item) = stream.next().await {
                match item {
                    ExportProgressItem::Size(size) => {
                        let event = ExportEvent {
                            event_type: ExportEventType::Size,
                            transfer_id,
                            name: name.clone(),
                            size: Some(size),
                            progress: None,
                            error: None,
                            paths: None,
                        };
                        let _ = tx.send(event);
                    }
                    ExportProgressItem::CopyProgress(offset) => {
                        let event = ExportEvent {
                            event_type: ExportEventType::Progress,
                            transfer_id,
                            name: name.clone(),
                            size: None,
                            progress: Some(offset),
                            error: None,
                            paths: None,
                        };
                        let _ = tx.send(event);
                    }
                    ExportProgressItem::Done => {
                        let event = ExportEvent {
                            event_type: ExportEventType::Done,
                            transfer_id,
                            name: name.clone(),
                            size: None,
                            progress: None,
                            error: None,
                            paths: None,
                        };
                        let _ = tx.send(event);
                    }
                    ExportProgressItem::Error(cause) => {
                        let event = ExportEvent {
                            event_type: ExportEventType::Error,
                            transfer_id,
                            name: name.clone(),
                            size: None,
                            progress: None,
                            error: Some(cause.to_string()),
                            paths: None,
                        };
                        let _ = tx.send(event);
                        return Err(Error::ExportItem {
                            name,
                            cause: cause.to_string(),
                        });
                    }
                }
            }

            Ok::<_, Error>(target_path)
        }));
    }

    let mut exported_paths = Vec::new();
    while let Some(res) = tasks.next().await {
        let path = res??;
        exported_paths.push(path);
    }

    let event = ExportEvent {
        event_type: ExportEventType::Finished,
        name: "".to_string(),
        transfer_id,
        size: None,
        progress: None,
        error: None,
        paths: Some(exported_paths),
    };

    let _ = tx.send(event);

    Ok(())
}

pub(crate) async fn receive_inner(
    transfer_id: u64,
    pool: ConnectionPool,
    ticket: BlobTicket,
    export_root: PathBuf,
    data_dir: PathBuf,
    progress_tx: mpsc::UnboundedSender<GetProgressEvent>,
    export_tx: mpsc::UnboundedSender<ExportEvent>,
) -> Result<()> {
    let dir_name = format!(".zephyr-recv-{}", ticket.hash().to_hex());
    let iroh_data_dir = data_dir.join(dir_name);

    let connecting = GetProgressEvent {
        event_type: GetEventType::Connecting,
        total_size: None,
        total_files: None,
        progress: None,
        from: None,
        transfer_id,
        ticket: Some(ticket.to_string()),
        error: None,
    };
    let _ = progress_tx.send(connecting);

    let store = Arc::new(FsStore::load(&iroh_data_dir).await?);

    let result = fetch_and_export(
        transfer_id,
        pool,
        &ticket,
        store.clone(),
        export_root,
        &progress_tx,
        export_tx,
    )
    .await;

    // The store owns open files and a background actor; it must be closed
    // before its directory can be removed, and on failure the directory is
    // kept so the transfer can resume later.
    if let Err(e) = store.shutdown().await {
        eprintln!("[receive:{transfer_id}] store shutdown failed: {e}");
    }
    result?;

    tokio::fs::remove_dir_all(iroh_data_dir).await?;

    Ok(())
}

async fn fetch_and_export(
    transfer_id: u64,
    pool: ConnectionPool,
    ticket: &BlobTicket,
    store: Arc<FsStore>,
    export_root: PathBuf,
    progress_tx: &mpsc::UnboundedSender<GetProgressEvent>,
    export_tx: mpsc::UnboundedSender<ExportEvent>,
) -> Result<()> {
    let remote_id = ticket.addr().id;
    let hash_and_format = ticket.hash_and_format();

    let local = store.remote().local(hash_and_format).await?;

    if local.is_complete() {
        let total_files = local.children().unwrap_or(1).saturating_sub(1);
        let start_event = GetProgressEvent {
            event_type: GetEventType::Started,
            total_size: None,
            total_files: Some(total_files),
            progress: None,
            from: None,
            transfer_id,
            ticket: Some(ticket.to_string()),
            error: None,
        };
        let _ = progress_tx.send(start_event);
    } else {
        // Keep `connection` (the pool ref) alive through the progress loop below.
        let connection = pool.get_or_connect(remote_id).await?;

        let (_hash_seq, sizes) =
            get_hash_seq_and_sizes(&connection, &hash_and_format.hash, 1024 * 1024 * 32, None)
                .await?;

        let payload_size = sizes.iter().skip(1).copied().sum::<u64>();
        let total_files = (sizes.len().saturating_sub(1)) as u64;

        let get = store
            .remote()
            .execute_get((*connection).clone(), local.missing());

        let start_event = GetProgressEvent {
            event_type: GetEventType::Started,
            total_size: Some(payload_size),
            total_files: Some(total_files),
            progress: None,
            from: None,
            transfer_id,
            ticket: Some(ticket.to_string()),
            error: None,
        };
        let _ = progress_tx.send(start_event);

        let mut stream = get.stream();
        while let Some(item) = stream.next().await {
            match item {
                GetProgressItem::Progress(offset) => {
                    let event = GetProgressEvent {
                        event_type: GetEventType::Progress,
                        progress: Some(offset),
                        total_size: None,
                        total_files: None,
                        from: None,
                        transfer_id,
                        ticket: None,
                        error: None,
                    };
                    let _ = progress_tx.send(event);
                }
                GetProgressItem::Done(_stats) => {
                    let event = GetProgressEvent {
                        event_type: GetEventType::Done,
                        progress: None,
                        total_size: None,
                        total_files: None,
                        from: None,
                        transfer_id,
                        ticket: None,
                        error: None,
                    };
                    let _ = progress_tx.send(event);

                    break;
                }
                GetProgressItem::Error(cause) => {
                    eprintln!("[receive:{transfer_id}] get failed: {cause}");
                    return Err(Error::ReceiveItem {
                        cause: cause.to_string(),
                    });
                }
            }
        }
    }

    let collection = Collection::load(hash_and_format.hash, &**store).await?;

    export(store, collection, export_root, transfer_id, export_tx).await
}
