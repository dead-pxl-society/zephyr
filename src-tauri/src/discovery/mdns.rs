use std::{
    collections::HashSet,
    sync::{Arc, Mutex},
    time::Duration,
};

use iroh::{PublicKey, Watcher};
use iroh_mdns_address_lookup::DiscoveryEvent;
use iroh_tickets::endpoint::EndpointTicket;
use n0_future::StreamExt;
use tauri::{Emitter, Manager};
use tokio::sync::mpsc::{self, UnboundedSender};

use crate::{
    error::Result,
    events::{PeerDiscoveryEvent, PeerDiscoveryType},
    state::AppState,
    util::peer_cache::{EphemeralPeer, PeerCache},
};

use super::identity::exchange_identity;

/// Quiet period after the last local address change before mDNS is rebuilt,
/// so an interface coming up with several addresses causes one recycle.
const NETWORK_CHANGE_DEBOUNCE: Duration = Duration::from_secs(2);

/// How long a fresh discoverer gets to re-report the peers it still sees
/// before cached peers it never mentioned are treated as gone.
const REDISCOVERY_GRACE: Duration = Duration::from_secs(3);

/// Endpoint ids a discoverer has reported since it was created.
type SeenPeers = Arc<Mutex<HashSet<PublicKey>>>;

/// Serialises enable, disable and recycle so a user toggle cannot interleave
/// with a network-triggered rebuild.
static LIFECYCLE: tokio::sync::Mutex<()> = tokio::sync::Mutex::const_new(());

pub(crate) async fn subscribe_to_mdns_events(app: tauri::AppHandle) -> Result<()> {
    let state = app.state::<AppState>();

    let tx = spawn_mdns_event_handler(app.clone(), SeenPeers::default());

    state.node()?.subscribe_mdns(tx).await?;

    Ok(())
}

fn expire_peer(app: &tauri::AppHandle, peer_cache: &PeerCache, endpoint_id: PublicKey) {
    let event = PeerDiscoveryEvent {
        event_type: PeerDiscoveryType::Expired,
        peer: EphemeralPeer {
            endpoint_id,
            ticket: None,
            peer: None,
            addr: None,
        },
        last_seen: None,
    };
    let _ = app.emit("peer_discovery", event);
    peer_cache.expire(endpoint_id);
}

/// Spawns the task that turns raw [`DiscoveryEvent`]s into front-end
/// `peer_discovery` events, and returns the sender that feeds it.
///
/// This is shared between the initial subscription and re-enabling mDNS at
/// runtime so the event-processing logic only lives in one place.
fn spawn_mdns_event_handler(
    app: tauri::AppHandle,
    seen: SeenPeers,
) -> UnboundedSender<DiscoveryEvent> {
    let state = app.state::<AppState>();
    let peer_cache = state.peer_cache();

    let (tx, mut rx) = mpsc::unbounded_channel();

    let app_handle = app.clone();
    tauri::async_runtime::spawn(async move {
        while let Some(event) = rx.recv().await {
            match event {
                DiscoveryEvent::Discovered {
                    endpoint_info,
                    last_updated,
                } => {
                    seen.lock().unwrap().insert(endpoint_info.endpoint_id);

                    let stored_peer = peer_cache.get(endpoint_info.endpoint_id);

                    if stored_peer.is_none()
                        && !peer_cache.is_blocked(endpoint_info.endpoint_id).await
                    {
                        let addr = endpoint_info.to_endpoint_addr();
                        let ticket = EndpointTicket::new(addr.clone());
                        let ephemeral = EphemeralPeer {
                            endpoint_id: endpoint_info.endpoint_id,
                            addr: Some(addr.clone()),
                            ticket: Some(ticket),
                            peer: None,
                        };

                        let initial_event = PeerDiscoveryEvent {
                            event_type: PeerDiscoveryType::Discovered,
                            peer: ephemeral.clone(),
                            last_seen: last_updated,
                        };

                        let _ = app_handle.emit("peer_discovery", initial_event);

                        if let Ok((stored_ephemeral, should_emit_enrich)) =
                            peer_cache.upsert(&ephemeral).await
                            && should_emit_enrich
                        {
                            if let Some(db_peer) = &stored_ephemeral.peer
                                && db_peer.name.is_none()
                            {
                                let exchange_app = app_handle.clone();
                                tauri::async_runtime::spawn(exchange_identity(exchange_app, addr));
                            }

                            // The peer might or might not have info but we send enriched because we now have db peer
                            let event = PeerDiscoveryEvent {
                                event_type: PeerDiscoveryType::Enriched,
                                peer: stored_ephemeral,
                                last_seen: None,
                            };
                            let _ = app_handle.emit("peer_discovery", event);
                        }
                    }
                }
                DiscoveryEvent::Expired { endpoint_id } => {
                    expire_peer(&app_handle, &peer_cache, endpoint_id);
                }
                _ => {}
            }
        }
    });

    tx
}

async fn start(app: &tauri::AppHandle) -> Result<SeenPeers> {
    let node = app.state::<AppState>().node()?;

    node.enable_mdns()?;

    let seen = SeenPeers::default();
    let tx = spawn_mdns_event_handler(app.clone(), seen.clone());
    node.subscribe_mdns(tx).await?;

    Ok(seen)
}

pub(crate) async fn disable_mdns(app: &tauri::AppHandle) -> Result<()> {
    let _lifecycle = LIFECYCLE.lock().await;

    app.state::<AppState>().node()?.disable_mdns()
}

pub(crate) async fn enable_mdns(app: &tauri::AppHandle) -> Result<()> {
    let _lifecycle = LIFECYCLE.lock().await;

    start(app).await.map(|_| ())
}

/// Rebuilds the discoverer after the local network changed.
///
/// The multicast socket joins its group once, on whatever interface was the
/// default at the time. After a sleep, a VPN toggle or a network switch it can
/// keep advertising while no longer hearing anyone, and only a new socket
/// recovers. Cached peers stay put while the new discoverer re-reports them;
/// whatever it has not mentioned by the end of the grace period is expired.
pub(crate) async fn recycle_mdns(app: &tauri::AppHandle) {
    let _lifecycle = LIFECYCLE.lock().await;

    let state = app.state::<AppState>();
    let Ok(node) = state.node() else {
        return;
    };
    if !node.mdns_enabled() {
        return;
    }

    let known: Vec<PublicKey> = state
        .peer_cache()
        .list()
        .iter()
        .map(|peer| peer.endpoint_id)
        .collect();

    if let Err(e) = node.disable_mdns() {
        eprintln!("[mdns] failed to stop discovery for recycle: {e}");
        return;
    }

    let seen = match start(app).await {
        Ok(seen) => seen,
        Err(e) => {
            eprintln!("[mdns] failed to restart discovery after network change: {e}");
            return;
        }
    };

    eprintln!("[mdns] discovery rebuilt after network change");

    let app = app.clone();
    tauri::async_runtime::spawn(async move {
        tokio::time::sleep(REDISCOVERY_GRACE).await;

        let state = app.state::<AppState>();
        let peer_cache = state.peer_cache();
        let seen = seen.lock().unwrap().clone();

        for endpoint_id in known {
            if !seen.contains(&endpoint_id) {
                expire_peer(&app, &peer_cache, endpoint_id);
            }
        }
    });
}

/// Follows the endpoint's own address set and recycles mDNS once it settles,
/// which covers waking from sleep, VPN toggles and changing networks.
pub(crate) fn watch_network_changes(app: tauri::AppHandle) {
    tauri::async_runtime::spawn(async move {
        let node = match app.state::<AppState>().node() {
            Ok(node) => node,
            Err(_) => return,
        };

        let mut changes = node.endpoint().watch_addr().stream();

        // The first item is the current value, not a change.
        if changes.next().await.is_none() {
            return;
        }

        while changes.next().await.is_some() {
            loop {
                match tokio::time::timeout(NETWORK_CHANGE_DEBOUNCE, changes.next()).await {
                    Ok(Some(_)) => continue,
                    Ok(None) => return,
                    Err(_) => break,
                }
            }

            recycle_mdns(&app).await;
        }
    });
}
