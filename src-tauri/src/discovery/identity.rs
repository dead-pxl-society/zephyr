use iroh::EndpointAddr;
use tauri::{Emitter, Manager};
use tokio::sync::mpsc;

use crate::{
    error::Result,
    events::{PeerDiscoveryEvent, PeerDiscoveryType},
    net::proto::identity::IdentityMessage,
    state::AppState,
};

pub(crate) async fn exchange_identity(
    app: tauri::AppHandle,
    remote_addr: EndpointAddr,
) -> Result<()> {
    let state = app.state::<AppState>();
    let identity = state.node()?.identity.clone();

    identity.exchange(remote_addr.id).await?;

    Ok(())
}

pub(crate) async fn handle_identity_protocol(
    app: tauri::AppHandle,
    mut receiver: mpsc::Receiver<IdentityMessage>,
) -> Result<()> {
    let state = app.state::<AppState>();

    let peer_cache = state.peer_cache();
    while let Some(msg) = receiver.recv().await {
        match msg {
            IdentityMessage::RemoteUser { user, endpoint_id } => {
                let ephemeral = match peer_cache.enrich(endpoint_id, user).await {
                    Ok(Some(ephemeral)) => ephemeral,
                    Ok(None) => continue,
                    Err(e) => {
                        eprintln!("[identity] failed to enrich peer {endpoint_id}: {e}");
                        continue;
                    }
                };

                let event = PeerDiscoveryEvent {
                    event_type: PeerDiscoveryType::Enriched,
                    peer: ephemeral,
                    last_seen: None,
                };
                let _ = app.emit("peer_discovery", event);
            }
        }
    }

    Ok(())
}
