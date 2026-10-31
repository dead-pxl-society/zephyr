use std::path::PathBuf;

use iroh::{EndpointAddr, EndpointId};
use iroh_blobs::ticket::BlobTicket;
use iroh_tickets::endpoint::EndpointTicket;
use tauri::Manager;
use tokio::sync::mpsc;

use crate::{
    error::{Error, Result},
    net::proto::share::{PeerInfo, ShareInfo},
    sharing::handle_selected_files,
    state::AppState,
    transfer::{handle_export_events, handle_get_progress},
    util::{file::calculate_selection_hash, parcel::Parcel},
};

pub async fn download_inner(
    ticket: BlobTicket,
    peer: Option<PeerInfo>,
    state: &AppState,
    app: &tauri::AppHandle,
) -> Result<u64> {
    let node = state.node()?;

    let download_dir = app.path().download_dir()?;
    let temp_dir = app.path().temp_dir()?;

    let (progress_tx, progress_rx) = mpsc::unbounded_channel();
    let (export_tx, export_rx) = mpsc::unbounded_channel();

    let transfer_id = node
        .receive(ticket, &download_dir, temp_dir, progress_tx, export_tx)
        .await?;

    tauri::async_runtime::spawn(handle_get_progress(app.clone(), peer, progress_rx, false));
    tauri::async_runtime::spawn(handle_export_events(app.clone(), export_rx));

    Ok(transfer_id)
}

#[tauri::command]
pub async fn download(
    ticket: BlobTicket,
    peer: Option<PeerInfo>,
    state: tauri::State<'_, AppState>,
    app: tauri::AppHandle,
) -> Result<u64> {
    download_inner(ticket, peer, state.inner(), &app).await
}

#[tauri::command]
pub async fn import(
    files: Vec<String>,
    app: tauri::AppHandle,
    state: tauri::State<'_, AppState>,
) -> Result<Parcel> {
    let paths: Vec<PathBuf> = files.iter().map(PathBuf::from).collect();
    let parcel = Parcel::new_with_files(files);

    let file_hash = calculate_selection_hash(paths.iter().map(PathBuf::as_path));
    state.set_last_selection_hash(file_hash);

    handle_selected_files(paths, &app, &parcel);

    Ok(parcel)
}

#[tauri::command]
pub async fn push(
    endpoint_id: EndpointId,
    info: ShareInfo,
    state: tauri::State<'_, AppState>,
) -> Result<usize> {
    let node = state.node()?;

    let cache = state.peer_cache();
    let peer = cache
        .get(endpoint_id)
        .and_then(|p| p.addr)
        .unwrap_or_else(|| EndpointAddr::from(endpoint_id));

    let request_id = node.share.share(info, node.router.endpoint(), peer).await?;

    Ok(request_id)
}

#[tauri::command]
pub async fn answer_share_request(
    request_id: usize,
    accepted: bool,
    state: tauri::State<'_, AppState>,
) -> Result<()> {
    let (_, tx) = state
        .share_requests()
        .remove(&request_id)
        .ok_or(Error::ShareRequestExpired)?;

    tx.send(accepted).map_err(|_| Error::ShareRequestExpired)
}

#[tauri::command]
pub async fn cancel_share_request(
    request_id: usize,
    state: tauri::State<'_, AppState>,
) -> Result<()> {
    state.node()?.share.cancel(request_id);

    Ok(())
}

#[tauri::command]
pub fn delete_imported_tag(parcel_id: usize, state: tauri::State<'_, AppState>) {
    let parcel_cache = state.parcel_cache();
    parcel_cache.delete(parcel_id);
}

#[tauri::command]
pub async fn endpoint_ticket(state: tauri::State<'_, AppState>) -> Result<EndpointTicket> {
    let node = state.node()?;

    Ok(EndpointTicket::new(node.router.endpoint().addr()))
}
