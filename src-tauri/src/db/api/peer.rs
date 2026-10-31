use iroh::{EndpointAddr, EndpointId};
use iroh_tickets::endpoint::EndpointTicket;
use surrealdb::{Surreal, engine::local::Db};
use surrealitos::SurrealId;

use crate::{
    AppState,
    db::{
        api::PaginationParameters,
        model::{
            Controller,
            peer::{NewPeer, Peer, PeerController, PeerFilters, PeerKind, PeerPatch, TrustLevel},
        },
    },
    error::{Error, Result},
    net::node::Node,
    util::peer_cache::refresh_nearby,
};

async fn ensure_not_contact(db: &Surreal<Db>, endpoint_id: EndpointId) -> Result<()> {
    let existing = PeerController::get_by_endpoint_id(db, endpoint_id).await?;
    match existing {
        Some(peer) if peer.kind == PeerKind::Contact => Err(Error::AlreadyContact),
        _ => Ok(()),
    }
}

pub async fn add_contact_by_ticket(
    node: &Node,
    db: &Surreal<Db>,
    ticket: EndpointTicket,
) -> Result<Peer> {
    let addr = ticket.endpoint_addr();
    if addr.id == node.endpoint_id() {
        return Err(Error::SelfContact);
    }
    ensure_not_contact(db, addr.id).await?;

    let remote_user = node.identity.get_remote(addr.id).await?;
    let new_peer = NewPeer {
        endpoint_id: addr.id,
        ticket,
        name: Some(remote_user.name),
        platform: Some(remote_user.platform),
        kind: Some(PeerKind::Contact),
        trust_level: None,
        created_at: None,
        updated_at: None,
        last_seen: None,
    };

    PeerController::create_or_update(db, &new_peer).await
}

pub async fn add_contact_by_endpoint(
    node: &Node,
    db: &Surreal<Db>,
    endpoint_id: EndpointId,
) -> Result<Peer> {
    if endpoint_id == node.endpoint_id() {
        return Err(Error::SelfContact);
    }
    ensure_not_contact(db, endpoint_id).await?;

    let remote_addr = EndpointAddr::from(endpoint_id);
    let ticket = EndpointTicket::from(remote_addr);
    let remote_user = node.identity.get_remote(endpoint_id).await?;

    let new_peer = NewPeer {
        endpoint_id,
        ticket,
        name: Some(remote_user.name),
        platform: Some(remote_user.platform),
        kind: Some(PeerKind::Contact),
        trust_level: None,
        created_at: None,
        updated_at: None,
        last_seen: None,
    };

    PeerController::create_or_update(db, &new_peer).await
}

async fn add_contact_by_db(db: &Surreal<Db>, id: SurrealId) -> Result<Peer> {
    let patch = PeerPatch {
        kind: Some(PeerKind::Contact),
        ..Default::default()
    };

    PeerController::update(db, &id.to_string(), &patch).await
}

#[tauri::command]
pub async fn get_peers(
    pagination: PaginationParameters<PeerFilters>,
    state: tauri::State<'_, AppState>,
) -> Result<Vec<Peer>> {
    let db = state.db();
    PeerController::get_many(db, &pagination).await
}

#[tauri::command]
pub async fn get_peer_count(
    pagination: PaginationParameters<PeerFilters>,
    state: tauri::State<'_, AppState>,
) -> Result<usize> {
    let db = state.db();
    PeerController::get_count(db, &pagination).await
}

#[tauri::command]
pub async fn add_contact(
    app: tauri::AppHandle,
    state: tauri::State<'_, AppState>,
    endpoint_id: Option<EndpointId>,
    db_id: Option<SurrealId>,
) -> Result<Peer> {
    let db = state.db();
    let peer = if let Some(endpoint_id) = endpoint_id {
        let node = state.node()?;

        add_contact_by_endpoint(&node, db, endpoint_id).await?
    } else if let Some(db_id) = db_id {
        add_contact_by_db(db, db_id).await?
    } else {
        return Err(Error::MissingPeerIdentifier);
    };

    refresh_nearby(&app).await;

    Ok(peer)
}

#[tauri::command]
pub async fn update_peer(
    app: tauri::AppHandle,
    state: tauri::State<'_, AppState>,
    id: String,
    patch: PeerPatch,
) -> Result<Peer> {
    let db = state.db();
    let peer = PeerController::update(db, &id, &patch).await?;

    refresh_nearby(&app).await;

    Ok(peer)
}

#[tauri::command]
pub async fn block_peer(
    state: tauri::State<'_, AppState>,
    endpoint_id: EndpointId,
) -> Result<Peer> {
    let db = state.db();

    let peer = match PeerController::get_by_endpoint_id(db, endpoint_id).await? {
        Some(existing) if existing.kind == PeerKind::Device => {
            return Err(Error::BlockingOwnDevice);
        }
        Some(existing) => PeerController::set_blocked(db, &existing.id.to_string(), true).await?,
        None => {
            let ticket = state
                .peer_cache()
                .get(endpoint_id)
                .and_then(|cached| cached.ticket)
                .unwrap_or_else(|| EndpointTicket::from(EndpointAddr::from(endpoint_id)));

            let new_peer = NewPeer {
                endpoint_id,
                ticket,
                kind: Some(PeerKind::Stranger),
                trust_level: Some(TrustLevel::Blocked),
                name: None,
                platform: None,
                created_at: None,
                updated_at: None,
                last_seen: None,
            };

            PeerController::create(db, &new_peer).await?
        }
    };

    state.peer_cache().expire(endpoint_id);

    if let Ok(node) = state.node() {
        node.disconnect(endpoint_id).await;
    }

    Ok(peer)
}

#[tauri::command]
pub async fn unblock_peer(
    app: tauri::AppHandle,
    state: tauri::State<'_, AppState>,
    endpoint_id: EndpointId,
) -> Result<Peer> {
    let db = state.db();
    let peer = PeerController::get_by_endpoint_id(db, endpoint_id)
        .await?
        .ok_or(Error::UnknownPeer)?;

    let peer = PeerController::set_blocked(db, &peer.id.to_string(), false).await?;

    refresh_nearby(&app).await;

    Ok(peer)
}

#[tauri::command]
pub async fn delete_stranger_peers(state: tauri::State<'_, AppState>) -> Result<()> {
    let db = state.db();
    PeerController::delete_strangers(db).await
}

#[tauri::command]
pub async fn endpoint_id_from_ticket(ticket: EndpointTicket) -> Result<EndpointId> {
    Ok(ticket.endpoint_addr().id)
}

#[tauri::command]
pub async fn add_contact_by_ticket_cmd(
    app: tauri::AppHandle,
    ticket: EndpointTicket,
    state: tauri::State<'_, AppState>,
) -> Result<Peer> {
    let node = state.node()?;
    let peer = add_contact_by_ticket(&node, state.db(), ticket).await?;

    refresh_nearby(&app).await;

    Ok(peer)
}
