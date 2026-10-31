use std::{path::PathBuf, str::FromStr};

use iroh_blobs::ticket::BlobTicket;
use iroh_tickets::endpoint::EndpointTicket;
use serde_json::json;
use tauri::{Emitter, Manager};
use tauri_plugin_clipboard_manager::ClipboardExt;
use tokio::sync::mpsc::{self, unbounded_channel};

use crate::{
    db::api::peer::add_contact_by_ticket,
    error::Result,
    events::{ImportErrorEvent, NotificationEvent, ShareRequest, ShareResponse, ShareResponseType},
    net::{api::download_inner, node::ImportProgress, proto::share::ShareMessage},
    state::AppState,
    transfer::{handle_export_events, handle_get_progress},
    util::{file::calculate_selection_hash, parcel::Parcel, peer_cache::refresh_nearby},
    window::{hide_window, show_window},
};

pub(crate) fn handle_selected_files(
    paths: Vec<PathBuf>,
    handle: &tauri::AppHandle,
    parcel: &Parcel,
) {
    if paths.is_empty() {
        return;
    }

    let app = handle.clone();
    let _ = app.emit("parcel", parcel);

    let Some(state) = app.try_state::<AppState>() else {
        eprintln!("[import] app state not initialized, ignoring selection");
        return;
    };

    let node = state.node();
    let parcel_cache = state.parcel_cache();
    let parcel = parcel.clone();

    tauri::async_runtime::spawn(async move {
        let (progress_tx, mut progress_rx) = unbounded_channel::<ImportProgress>();

        let app_clone = app.clone();
        tauri::async_runtime::spawn(async move {
            while let Some(msg) = progress_rx.recv().await {
                let _ = app_clone.emit("import_progress", &msg);
            }
        });

        let imported = match node {
            Ok(node) => {
                node.generate_share_info(paths, parcel.id, progress_tx)
                    .await
            }
            Err(e) => Err(e),
        };

        match imported {
            Ok((share_info, hash, tag)) => {
                let final_parcel = Parcel {
                    total_files: Some(share_info.total_files),
                    size: Some(share_info.size),
                    ticket: Some(share_info.ticket.to_string()),
                    hash: Some(hash.to_string()),
                    ..parcel
                };

                parcel_cache.add(parcel.id, tag);

                let _ = app.emit("share_ready", &final_parcel);
                let _ = app.emit("parcel", &final_parcel);
            }
            Err(error) => {
                eprintln!("[import] parcel {} failed: {error}", parcel.id);
                let event = ImportErrorEvent {
                    parcel_id: parcel.id,
                    error,
                };
                let _ = app.emit("import_error", &event);
            }
        }
    });
}

pub(crate) fn handle_share_shortcut(files: Vec<String>, handle: &tauri::AppHandle) {
    let Some(share_window) = handle.get_webview_window("share") else {
        return;
    };
    let is_visible = share_window.is_visible().unwrap_or(false);
    let is_focused = share_window.is_focused().unwrap_or(false);

    if !is_visible {
        show_window(&share_window);
    }

    if files.is_empty() {
        if is_visible {
            hide_window(share_window);
        }
        return;
    }

    let paths: Vec<PathBuf> = files.iter().map(PathBuf::from).collect();
    let file_hash = calculate_selection_hash(paths.iter().map(PathBuf::as_path));

    let state = handle.state::<AppState>();
    let previous_hash = state.last_selection_hash();

    let should_toggle = previous_hash == file_hash && is_visible;

    state.set_last_selection_hash(file_hash);

    if should_toggle {
        hide_window(share_window);
        return;
    }

    if !is_focused {
        show_window(&share_window);
    }

    let parcel = Parcel::new_with_files(files);

    let _ = handle.emit("import_start", &parcel);

    handle_selected_files(paths, handle, &parcel);
}

pub(crate) async fn handle_share_messages(
    app: tauri::AppHandle,
    mut receiver: mpsc::Receiver<ShareMessage>,
) -> Result<()> {
    let state = app.state::<AppState>();
    let requests = state.share_requests();

    while let Some(msg) = receiver.recv().await {
        match msg {
            ShareMessage::Requested {
                peer,
                info,
                request_id,
                responder,
            } => {
                let share_request = ShareRequest {
                    peer,
                    info,
                    request_id,
                };
                requests.insert(request_id, responder);

                let _ = app.emit("share_request", share_request);
            }
            ShareMessage::Accepted {
                endpoint_id,
                request_id,
            } => {
                let response = ShareResponse {
                    response_type: ShareResponseType::Accepted,
                    endpoint_id,
                    request_id,
                };
                let _ = app.emit("share_response", &response);
            }
            ShareMessage::Rejected {
                endpoint_id,
                request_id,
            } => {
                let response = ShareResponse {
                    response_type: ShareResponseType::Rejected,
                    endpoint_id,
                    request_id,
                };
                let _ = app.emit("share_response", &response);
            }
            ShareMessage::Cancelled {
                endpoint_id,
                request_id,
            } => {
                requests.remove(&request_id);
                let response = ShareResponse {
                    response_type: ShareResponseType::Cancelled,
                    endpoint_id,
                    request_id,
                };
                let _ = app.emit("share_response", &response);
            }
            ShareMessage::Timeout {
                endpoint_id,
                request_id,
            } => {
                requests.remove(&request_id);
                let response = ShareResponse {
                    response_type: ShareResponseType::Timeout,
                    endpoint_id,
                    request_id,
                };
                let _ = app.emit("share_response", &response);
            }
            ShareMessage::Unknown {
                endpoint_id,
                request_id,
            } => {
                let response = ShareResponse {
                    response_type: ShareResponseType::Unknown,
                    endpoint_id,
                    request_id,
                };
                let _ = app.emit("share_response", &response);
            }
            ShareMessage::ReceiveTrusted { ticket, peer } => {
                let peer_name = peer.name.clone();

                if let Err(e) = download_inner(ticket, Some(peer), &app.state(), &app).await {
                    eprintln!("[share] trusted receive from {peer_name:?} could not start: {e}");
                    continue;
                }

                let (body, args) = match peer_name {
                    Some(name) => (
                        "notifications:receiving_trusted_files_body",
                        Some(json!({ "peer": name })),
                    ),
                    None => ("notifications:receiving_trusted_files_body_unknown", None),
                };

                let event = NotificationEvent {
                    title: "notifications:receiving_trusted_files_title".to_string(),
                    body: Some(body.to_string()),
                    sound: Some("chime".to_string()),
                    args,
                };

                let _ = app.emit("notify", event);
            }
        }
    }

    Ok(())
}

pub(crate) async fn handle_receive(app: &tauri::AppHandle) -> Result<()> {
    let cpy = app.clipboard().read_text()?;

    if cpy.starts_with("blob") {
        let state = app.state::<AppState>();
        let ticket = BlobTicket::from_str(&cpy)?;
        let node = state.node()?;

        let download_dir = app.path().download_dir()?;
        let temp_dir = app.path().temp_dir()?;

        let (progress_tx, progress_rx) = mpsc::unbounded_channel();
        let (export_tx, export_rx) = mpsc::unbounded_channel();

        let _transfer_id = node
            .receive(ticket, &download_dir, temp_dir, progress_tx, export_tx)
            .await?;

        let _ = app.emit("sound:play", "ready");
        tauri::async_runtime::spawn(handle_get_progress(app.clone(), None, progress_rx, true));
        tauri::async_runtime::spawn(handle_export_events(app.clone(), export_rx));

        return Ok(());
    }

    if cpy.starts_with("endpoint") {
        let state = app.state::<AppState>();
        let db = state.db();
        let node = state.node()?;

        let ticket = EndpointTicket::from_str(&cpy)?;

        let contact = add_contact_by_ticket(&node, db, ticket).await?;

        let _ = app.emit("contact_added", &contact);
        refresh_nearby(app).await;
    }

    Ok(())
}
