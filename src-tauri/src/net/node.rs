use std::{
    path::{Path, PathBuf},
    sync::Mutex,
    time::Duration,
};

use futures_buffered::BufferedStreamExt;
use iroh::{
    Endpoint, EndpointAddr, EndpointId, RelayMap, RelayMode, RelayUrl, SecretKey,
    address_lookup::{
        AddressLookupBuilder, DnsAddressLookup, PkarrPublisher, memory::MemoryLookup,
    },
    endpoint::{
        AfterHandshakeOutcome, BeforeConnectOutcome, Connection, EndpointHooks, VarInt, presets,
    },
    protocol::Router,
};
use iroh_blobs::{
    ALPN as BLOBS_ALPN, BlobFormat, BlobsProtocol, Hash,
    api::{
        TempTag,
        blobs::{AddPathOptions, AddProgressItem, ImportMode},
    },
    format::collection::Collection,
    provider::events::{ConnectMode, EventMask, EventSender, ProviderMessage, RequestMode},
    store::{fs::FsStore, mem::MemStore},
    ticket::BlobTicket,
};
use iroh_gossip::net::{GOSSIP_ALPN, Gossip};
use iroh_mdns_address_lookup::{DiscoveryEvent, MdnsAddressLookup};
use iroh_util::connection_pool::{ConnectionPool, Options as PoolOptions};
use n0_future::StreamExt;
use serde::Serialize;
use surrealdb::{Surreal, engine::local::Db};
use tokio::sync::mpsc::{self, UnboundedSender};

use crate::{
    db::model::{peer::PeerController, user::User},
    error::{Error, Result},
    net::{
        export::{ExportEvent, GetEventType, GetProgressEvent, next_transfer_id},
        proto::{
            device::{DEVICE_ALPN, DeviceMessage, DeviceProtocol},
            identity::{INFO_ALPN, IdentityMessage, IdentityProtocol},
            share::{SHARE_ALPN, ShareInfo, ShareMessage, ShareProtocol},
        },
        util::paths_to_data_sources,
    },
};

const GOSSIP_MAX_MESSAGE_SIZE: usize = 65_536;
pub const CLIP_ALPN: &[u8] = b"zephyr/clip/0";

const BLOCKED_CLOSE_CODE: u32 = 9;

#[derive(Debug)]
struct BlockHook {
    db: Surreal<Db>,
}

impl EndpointHooks for BlockHook {
    async fn before_connect<'a>(
        &'a self,
        remote_addr: &'a EndpointAddr,
        _alpn: &'a [u8],
    ) -> BeforeConnectOutcome {
        match PeerController::is_blocked(&self.db, remote_addr.id).await {
            Ok(true) => BeforeConnectOutcome::Reject,
            _ => BeforeConnectOutcome::Accept,
        }
    }

    async fn after_handshake<'a>(&'a self, conn: &'a Connection) -> AfterHandshakeOutcome {
        match PeerController::is_blocked(&self.db, conn.remote_id()).await {
            Ok(true) => AfterHandshakeOutcome::Reject {
                error_code: VarInt::from_u32(BLOCKED_CLOSE_CODE),
                reason: b"blocked".to_vec(),
            },
            _ => AfterHandshakeOutcome::Accept,
        }
    }
}

#[derive(Debug, Clone)]
pub struct ClipboardBlobs {
    pub store: MemStore,
    pub pool: ConnectionPool,
}

#[allow(dead_code)]
pub struct Imported {
    tag: TempTag,
    size: u64,
    total_files: usize,
    collection: Collection,
}

#[derive(Debug, Serialize, Default)]
#[serde(rename_all(serialize = "camelCase"))]
pub enum ImportProgressType {
    #[default]
    Size,
    CopyProgress,
    CopyDone,
    OutboardProgress,
    Done,
    Error,
}

#[derive(Debug, Serialize, Default)]
#[serde(rename_all(serialize = "camelCase"))]
pub struct ImportProgress {
    #[serde(alias = "type", rename = "type")]
    pub event_type: ImportProgressType,
    pub key: String,
    #[serde(alias = "parcelId")]
    pub parcel_id: usize,
    pub size: Option<u64>,
    pub progress: Option<u64>,
    pub error: Option<String>,
}

pub struct NodeSenders {
    pub provide: mpsc::Sender<ProviderMessage>,
    pub identity: mpsc::Sender<IdentityMessage>,
    pub share: mpsc::Sender<ShareMessage>,
    pub device: mpsc::Sender<DeviceMessage>,
}

fn relay_mode() -> Result<RelayMode> {
    let Some(urls) = option_env!("ZEPHYR_RELAYS").filter(|urls| !urls.trim().is_empty()) else {
        return Ok(RelayMode::Default);
    };
    let map = urls
        .split(',')
        .map(|url| url.trim().parse::<RelayUrl>())
        .collect::<std::result::Result<RelayMap, _>>()?;
    Ok(RelayMode::Custom(map))
}

/// The iroh endpoint plus every protocol mounted on it. All handles are
/// cheaply cloneable. The only mutable part is the mDNS toggle, which keeps
/// its own lock so nothing else ever has to wait on it.
#[allow(dead_code)]
pub struct Node {
    pub(crate) router: Router,
    pub(crate) blobs: BlobsProtocol,
    mdns: Mutex<Option<MdnsAddressLookup>>,
    pub(crate) gossip: Gossip,
    pub(crate) identity: IdentityProtocol,
    pub(crate) share: ShareProtocol,
    pub(crate) device: DeviceProtocol,
    pub(crate) blobs_pool: ConnectionPool,
    pub(crate) clip: ClipboardBlobs,
    /// Seeded with family roster addresses so off-LAN device dials resolve.
    pub(crate) memory_lookup: MemoryLookup,
}

impl Node {
    pub async fn setup(
        db: Surreal<Db>,
        data_dir: PathBuf,
        secret_key: SecretKey,
        user: &User,
        senders: NodeSenders,
    ) -> Result<Self> {
        tokio::fs::create_dir_all(&data_dir).await?;

        let endpoint = Endpoint::builder(presets::N0)
            .relay_mode(relay_mode()?)
            .secret_key(secret_key)
            .hooks(BlockHook { db: db.clone() })
            .bind()
            .await?;

        let store = FsStore::load(&data_dir).await?;

        let event_mask = EventMask {
            connected: ConnectMode::Notify,
            get: RequestMode::NotifyLog,
            ..EventMask::DEFAULT
        };
        let event_sender = EventSender::new(senders.provide, event_mask);
        let blobs = BlobsProtocol::new(&store, Some(event_sender));

        let pool_opts = PoolOptions {
            idle_timeout: Duration::from_secs(30),
            connect_timeout: Duration::from_secs(10),
            ..Default::default()
        };
        let identity_pool = ConnectionPool::new(endpoint.clone(), INFO_ALPN, pool_opts.clone());
        let device_pool = ConnectionPool::new(endpoint.clone(), DEVICE_ALPN, pool_opts.clone());
        let blobs_pool = ConnectionPool::new(endpoint.clone(), BLOBS_ALPN, pool_opts.clone());
        let clip_pool = ConnectionPool::new(endpoint.clone(), CLIP_ALPN, pool_opts);

        let identity = IdentityProtocol::new(user.clone(), senders.identity, identity_pool);
        let share = ShareProtocol::new(
            db.clone(),
            senders.share,
            endpoint.clone(),
            identity.clone(),
        );
        let device = DeviceProtocol::new(
            db,
            user.clone(),
            endpoint.clone(),
            senders.device,
            device_pool,
        );

        let gossip = Gossip::builder()
            .max_message_size(GOSSIP_MAX_MESSAGE_SIZE)
            .spawn(endpoint.clone());

        let clip_store = MemStore::new();
        let clip_blobs = BlobsProtocol::new(&clip_store, None);

        let mdns = MdnsAddressLookup::builder().build(endpoint.id())?;
        endpoint.address_lookup()?.add(mdns.clone());

        let memory_lookup = MemoryLookup::new();
        endpoint.address_lookup()?.add(memory_lookup.clone());

        let router = iroh::protocol::Router::builder(endpoint.clone())
            .accept(BLOBS_ALPN, blobs.clone())
            .accept(CLIP_ALPN, clip_blobs)
            .accept(GOSSIP_ALPN, gossip.clone())
            .accept(INFO_ALPN, identity.clone())
            .accept(SHARE_ALPN, share.clone())
            .accept(DEVICE_ALPN, device.clone())
            .spawn();

        Ok(Self {
            router,
            blobs,
            mdns: Mutex::new(Some(mdns)),
            gossip,
            identity,
            share,
            device,
            blobs_pool,
            clip: ClipboardBlobs {
                store: clip_store,
                pool: clip_pool,
            },
            memory_lookup,
        })
    }

    pub fn endpoint(&self) -> &Endpoint {
        self.router.endpoint()
    }

    pub fn endpoint_id(&self) -> EndpointId {
        self.router.endpoint().id()
    }

    pub async fn disconnect(&self, id: EndpointId) {
        let _ = self.identity.pool.close(id).await;
        let _ = self.device.pool.close(id).await;
        let _ = self.blobs_pool.close(id).await;
        let _ = self.clip.pool.close(id).await;
    }

    pub async fn shutdown(&self) {
        let _ = self.router.shutdown().await;
        self.router.endpoint().close().await;
    }

    fn mdns(&self) -> Option<MdnsAddressLookup> {
        self.mdns.lock().unwrap().clone()
    }

    pub async fn subscribe_mdns(&self, tx: UnboundedSender<DiscoveryEvent>) -> Result<()> {
        let Some(mdns) = self.mdns() else {
            return Ok(());
        };

        let mut events = mdns.subscribe().await;

        tauri::async_runtime::spawn(async move {
            while let Some(event) = events.next().await {
                let _ = tx.send(event);
            }
        });

        Ok(())
    }

    pub fn mdns_enabled(&self) -> bool {
        self.mdns().is_some()
    }

    pub fn enable_mdns(&self) -> Result<MdnsAddressLookup> {
        let mut guard = self.mdns.lock().unwrap();
        if let Some(mdns) = guard.as_ref() {
            return Ok(mdns.clone());
        }

        let endpoint = self.router.endpoint();
        let mdns = MdnsAddressLookup::builder().build(endpoint.id())?;
        endpoint.address_lookup()?.add(mdns.clone());
        *guard = Some(mdns.clone());

        Ok(mdns)
    }

    pub fn disable_mdns(&self) -> Result<()> {
        let mut guard = self.mdns.lock().unwrap();
        if guard.is_none() {
            return Ok(());
        }

        let endpoint = self.router.endpoint();
        let lookup = endpoint.address_lookup()?;

        lookup.clear();

        let publisher = PkarrPublisher::n0_dns().into_address_lookup(endpoint)?;
        let dns_lookup = DnsAddressLookup::n0_dns().into_address_lookup(endpoint)?;
        lookup.add(publisher);
        lookup.add(dns_lookup);
        lookup.add(self.memory_lookup.clone());

        *guard = None;

        Ok(())
    }

    pub async fn import(
        &self,
        paths: Vec<PathBuf>,
        parcel_id: usize,
        progress_tx: mpsc::UnboundedSender<ImportProgress>,
    ) -> Result<Imported> {
        let parallelism = num_cpus::get();
        let store = self.blobs.store();

        let data_sources = paths_to_data_sources(&paths)?;

        let mut names_and_tags = n0_future::stream::iter(data_sources)
            .map(|(name, path)| {
                let store = store.clone();
                let tx = progress_tx.clone();
                async move {
                    let add_progress = store.add_path_with_opts(AddPathOptions {
                        path,
                        mode: ImportMode::TryReference,
                        format: BlobFormat::Raw,
                    });

                    let mut stream = add_progress.stream().await;
                    let mut item_size = 0;

                    let tag = loop {
                        let item = stream.next().await.ok_or(Error::NoTagForStream)?;
                        let key = name.clone();

                        match item {
                            AddProgressItem::Size(size) => {
                                let event = ImportProgress {
                                    event_type: ImportProgressType::Size,
                                    key,
                                    size: Some(size),
                                    parcel_id,
                                    ..Default::default()
                                };
                                let _ = tx.send(event);
                                item_size = size;
                            }
                            AddProgressItem::CopyProgress(offset) => {
                                let event = ImportProgress {
                                    event_type: ImportProgressType::CopyProgress,
                                    key,
                                    progress: Some(offset),
                                    parcel_id,
                                    ..Default::default()
                                };
                                let _ = tx.send(event);
                            }
                            AddProgressItem::CopyDone => {
                                let event = ImportProgress {
                                    event_type: ImportProgressType::CopyDone,
                                    key,
                                    parcel_id,
                                    ..Default::default()
                                };
                                let _ = tx.send(event);
                            }
                            AddProgressItem::OutboardProgress(offset) => {
                                let event = ImportProgress {
                                    event_type: ImportProgressType::OutboardProgress,
                                    key,
                                    progress: Some(offset),
                                    parcel_id,
                                    ..Default::default()
                                };
                                let _ = tx.send(event);
                            }
                            AddProgressItem::Error(cause) => {
                                let event = ImportProgress {
                                    event_type: ImportProgressType::Error,
                                    key,
                                    error: Some(cause.to_string()),
                                    parcel_id,
                                    ..Default::default()
                                };
                                let _ = tx.send(event);
                                return Err(Error::AddItem {
                                    name: name.clone(),
                                    cause: cause.to_string(),
                                });
                            }
                            AddProgressItem::Done(tt) => {
                                let event = ImportProgress {
                                    event_type: ImportProgressType::Done,
                                    key,
                                    parcel_id,
                                    ..Default::default()
                                };
                                let _ = tx.send(event);
                                break tt;
                            }
                        }
                    };

                    Ok((name, tag, item_size))
                }
            })
            .buffered_unordered(parallelism)
            .collect::<Vec<_>>()
            .await
            .into_iter()
            .collect::<Result<Vec<_>>>()?;

        names_and_tags.sort_by(|(a, _, _), (b, _, _)| a.cmp(b));
        let size = names_and_tags.iter().map(|(_, _, size)| *size).sum::<u64>();
        let total_files = names_and_tags.len();

        let (collection, tags) = names_and_tags
            .into_iter()
            .map(|(name, tag, _)| ((name, tag.hash()), tag))
            .unzip::<_, _, Collection, Vec<_>>();
        let tag = collection.clone().store(store).await?;
        drop(tags);

        Ok(Imported {
            tag,
            size,
            total_files,
            collection,
        })
    }

    pub async fn generate_share_info(
        &self,
        paths: Vec<PathBuf>,
        parcel_id: usize,
        progress_tx: mpsc::UnboundedSender<ImportProgress>,
    ) -> Result<(ShareInfo, Hash, TempTag)> {
        let imported = self.import(paths, parcel_id, progress_tx).await?;
        let hash = imported.tag.hash();
        let node_addr = self.router.endpoint().addr();

        let ticket = BlobTicket::new(node_addr, hash, BlobFormat::HashSeq);

        let share_info = ShareInfo {
            ticket,
            total_files: imported.total_files,
            size: imported.size,
        };

        Ok((share_info, hash, imported.tag))
    }

    pub async fn receive(
        &self,
        ticket: BlobTicket,
        export_root: &Path,
        data_dir: PathBuf,
        progress_tx: mpsc::UnboundedSender<GetProgressEvent>,
        export_tx: mpsc::UnboundedSender<ExportEvent>,
    ) -> Result<u64> {
        let pool = self.blobs_pool.clone();
        let export_root = export_root.to_path_buf();
        let transfer_id = next_transfer_id();

        tauri::async_runtime::spawn(async move {
            if let Err(e) = super::export::receive_inner(
                transfer_id,
                pool,
                ticket,
                export_root,
                data_dir,
                progress_tx.clone(),
                export_tx,
            )
            .await
            {
                let event = GetProgressEvent {
                    event_type: GetEventType::Error,
                    progress: None,
                    total_size: None,
                    total_files: None,
                    from: None,
                    transfer_id,
                    ticket: None,
                    error: Some(e.to_string()),
                };
                let _ = progress_tx.send(event);
            }
        });
        Ok(transfer_id)
    }
}
