use tauri::{Emitter, Manager};
use tokio::sync::mpsc;

use crate::{
    db::{api::config::publish_config, model::config::ConfigController},
    error::Result,
    events::{
        DeviceInviteRequest, DevicePairingEvent, DevicePairingType, FamilyLeftEvent,
        FamilyLeftReason,
    },
    family::api::build_family_view,
    net::proto::device::DeviceMessage,
    state::AppState,
    util::peer_cache::refresh_nearby,
};

pub(crate) async fn handle_device_messages(
    app: tauri::AppHandle,
    mut receiver: mpsc::Receiver<DeviceMessage>,
) -> Result<()> {
    let state = app.state::<AppState>();

    while let Some(msg) = receiver.recv().await {
        match msg {
            DeviceMessage::InviteReceived {
                session_id,
                peer,
                code,
                responder,
            } => {
                state.device_invites().insert(session_id, responder);

                let event = DeviceInviteRequest {
                    session_id,
                    peer,
                    code,
                };
                let _ = app.emit("device:invite_request", event);
            }
            DeviceMessage::ShowCode {
                session_id,
                peer,
                code,
            } => {
                let event = DevicePairingEvent {
                    event_type: DevicePairingType::Code,
                    session_id,
                    peer: Some(peer),
                    code: Some(code),
                    reason: None,
                };
                let _ = app.emit("device:pairing", event);
            }
            DeviceMessage::Paired { session_id, peer } => {
                let event = DevicePairingEvent {
                    event_type: DevicePairingType::Completed,
                    session_id,
                    peer: Some(peer),
                    code: None,
                    reason: None,
                };
                let _ = app.emit("device:pairing", event);
            }
            DeviceMessage::PairingFailed { session_id, reason } => {
                // Drop any pending responder so a stale dialog can't answer a
                // dead session.
                state.device_invites().remove(&session_id);

                let event = DevicePairingEvent {
                    event_type: DevicePairingType::Failed,
                    session_id,
                    peer: None,
                    code: None,
                    reason: Some(reason),
                };
                let _ = app.emit("device:pairing", event);
            }
            DeviceMessage::PairingRejected { session_id, reason } => {
                state.device_invites().remove(&session_id);

                let event = DevicePairingEvent {
                    event_type: DevicePairingType::Rejected,
                    session_id,
                    peer: None,
                    code: None,
                    reason: Some(reason.to_string()),
                };
                let _ = app.emit("device:pairing", event);
            }
            DeviceMessage::PairingCancelled { session_id } => {
                state.device_invites().remove(&session_id);

                let event = DevicePairingEvent {
                    event_type: DevicePairingType::Cancelled,
                    session_id,
                    peer: None,
                    code: None,
                    reason: None,
                };
                let _ = app.emit("device:pairing", event);
            }
            DeviceMessage::ConfigChanged => {
                if let Ok(config) = ConfigController::state(state.db()).await {
                    publish_config(&app, &config);
                }
            }
            DeviceMessage::RosterAdopted => {
                if let Some(runtime) = state.family_runtime() {
                    runtime.on_state_changed().await;
                }

                refresh_nearby(&app).await;

                if let Ok(Some(view)) = build_family_view(&app).await {
                    let _ = app.emit("family_updated", view);
                }
            }
            DeviceMessage::Revoked => {
                if let Some(runtime) = state.family_runtime() {
                    runtime.on_revoked().await;
                }

                refresh_nearby(&app).await;

                let event = FamilyLeftEvent {
                    reason: FamilyLeftReason::Kicked,
                };
                let _ = app.emit("family_left", event);
            }
        }
    }

    Ok(())
}
