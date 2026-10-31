use std::{collections::BTreeMap, sync::Arc};

use iroh_blobs::{
    protocol::ChunkRangesSeq,
    provider::events::{ProviderMessage, RequestUpdate},
};
use n0_future::{FuturesUnordered, StreamExt};
use tauri::Emitter;
use tokio::sync::mpsc;

use crate::{
    error::Result,
    events::{BlobConnectionEvent, NotificationEvent, SendEventType, SendProgressEvent},
    net::{
        export::{ExportEvent, GetEventType, GetProgressEvent, PerConnectionProgress},
        proto::share::PeerInfo,
    },
};

async fn per_request_progress(
    app: tauri::AppHandle,
    connection_id: u64,
    request_id: u64,
    connections: Arc<std::sync::Mutex<BTreeMap<u64, PerConnectionProgress>>>,
    mut rx: irpc::channel::mpsc::Receiver<RequestUpdate>,
    report: bool,
) {
    let endpoint_id = if let Some(connection) = connections.lock().unwrap().get_mut(&connection_id)
    {
        connection.requests.insert(request_id, ());
        connection.endpoint_id.clone()
    } else {
        println!("got request for unknown connection {connection_id}");
        return;
    };

    while let Ok(Some(msg)) = rx.recv().await {
        match msg {
            RequestUpdate::Started(msg) => {
                let event = SendProgressEvent {
                    event_type: SendEventType::Started,
                    connection_id,
                    request_id,
                    endpoint_id: endpoint_id.clone(),
                    size: Some(msg.size),
                    progress: None,
                };
                if report {
                    let _ = app.emit("send_progress", &event);
                }
            }
            RequestUpdate::Progress(msg) => {
                let event = SendProgressEvent {
                    event_type: SendEventType::Progress,
                    connection_id,
                    request_id,
                    endpoint_id: endpoint_id.clone(),
                    size: None,
                    progress: Some(msg.end_offset),
                };
                if report {
                    let _ = app.emit("send_progress", &event);
                }
            }
            RequestUpdate::Completed(_) => {
                let event = SendProgressEvent {
                    event_type: SendEventType::Completed,
                    connection_id,
                    request_id,
                    endpoint_id: endpoint_id.clone(),
                    size: None,
                    progress: None,
                };
                if report {
                    let _ = app.emit("send_progress", &event);
                }

                connections
                    .lock()
                    .unwrap()
                    .get_mut(&connection_id)
                    .map(|c| c.requests.remove(&request_id));
            }
            RequestUpdate::Aborted(_) => {
                let event = SendProgressEvent {
                    event_type: SendEventType::Aborted,
                    connection_id,
                    request_id,
                    endpoint_id: endpoint_id.clone(),
                    size: None,
                    progress: None,
                };
                if report {
                    let _ = app.emit("send_progress", &event);
                }
                connections
                    .lock()
                    .unwrap()
                    .get_mut(&connection_id)
                    .map(|c| c.requests.remove(&request_id));
            }
        }
    }

    // Clean up on finish
    connections
        .lock()
        .unwrap()
        .get_mut(&connection_id)
        .map(|c| c.requests.remove(&request_id));
}

pub(crate) async fn handle_provider_progress(
    app: tauri::AppHandle,
    mut recv: mpsc::Receiver<ProviderMessage>,
) -> Result<()> {
    let connections = Arc::new(std::sync::Mutex::new(
        BTreeMap::<u64, PerConnectionProgress>::new(),
    ));
    let mut tasks = FuturesUnordered::new();

    loop {
        tokio::select! {
            biased;
            item = recv.recv() => {
                let Some(item) = item else { break };

                match item {
                    ProviderMessage::ClientConnectedNotify(msg) => {
                        let endpoint_id = msg.endpoint_id
                            .map(|id| id.fmt_short().to_string())
                            .unwrap_or_else(|| "?".into());
                        let connection_id = msg.connection_id;

                        let event = BlobConnectionEvent {
                            endpoint_id: endpoint_id.clone(),
                            connection_id,
                            connected: true,
                        };

                        connections.lock().unwrap().insert(
                            connection_id,
                            PerConnectionProgress {
                                requests: BTreeMap::new(),
                                endpoint_id: endpoint_id.clone(),
                            },
                        );

                        let _ = app.emit("blobs_connection", &event);
                    }
                    ProviderMessage::ConnectionClosed(msg) => {
                        if let Some(connection) = connections.lock().unwrap().remove(&msg.connection_id) {
                            let event = BlobConnectionEvent {
                                endpoint_id: connection.endpoint_id,
                                connection_id: msg.connection_id,
                                connected: false,
                            };
                            let _ = app.emit("blobs_connection", &event);
                        }
                    }
                    ProviderMessage::GetRequestReceivedNotify(msg) => {
                        let request_id = msg.request_id;
                        let connection_id = msg.connection_id;
                        let connections = connections.clone();
                        let app = app.clone();

                        let is_size_probe = msg.request.ranges == ChunkRangesSeq::verified_child_sizes();

                        tasks.push(per_request_progress(app, connection_id, request_id, connections, msg.rx, !is_size_probe));
                    }
                    _ => {}
                }
            }
            Some(_) = tasks.next(), if !tasks.is_empty() => {}
        }
    }

    Ok(())
}

pub(crate) async fn handle_get_progress(
    app: tauri::AppHandle,
    peer: Option<PeerInfo>,
    mut receiver: mpsc::UnboundedReceiver<GetProgressEvent>,
    notify: bool,
) -> Result<()> {
    while let Some(mut msg) = receiver.recv().await {
        let announces = matches!(
            msg.event_type,
            GetEventType::Connecting | GetEventType::Started
        );
        if announces && peer.is_some() {
            msg.from = peer.clone();
        }

        if msg.event_type == GetEventType::Started && notify {
            let event = NotificationEvent {
                title: "notifications:receiving_files_title".to_string(),
                body: Some("notifications:receiving_files_body".to_string()),
                sound: Some("chime".to_string()),
                args: None,
            };
            let _ = app.emit("notify", event);
        }

        if msg.event_type == GetEventType::Done && notify {
            let event = NotificationEvent {
                title: "notifications:transfer_complete_title".to_string(),
                body: Some("notifications:transfer_complete_body".to_string()),
                sound: None,
                args: None,
            };
            let _ = app.emit("notify", event);
        }

        let _ = app.emit("get_progress", &msg);
    }

    Ok(())
}

pub(crate) async fn handle_export_events(
    app: tauri::AppHandle,
    mut receiver: mpsc::UnboundedReceiver<ExportEvent>,
) -> Result<()> {
    while let Some(msg) = receiver.recv().await {
        let _ = app.emit("export_event", &msg);
    }

    Ok(())
}
