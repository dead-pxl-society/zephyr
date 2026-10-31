use iroh::{EndpointAddr, EndpointId};
use serde::Serialize;
use tauri::Manager;

use crate::{
    db::model::{
        family::FamilyController,
        peer::{Peer, PeerController, PeerKind},
    },
    error::{Error, Result},
    state::AppState,
};

#[derive(Clone, Serialize)]
#[serde(rename_all(serialize = "camelCase"))]
pub struct DeviceView {
    pub peer: Peer,
    pub online: bool,
}

#[derive(Clone, Serialize)]
#[serde(rename_all(serialize = "camelCase"))]
pub struct FamilyView {
    pub family_id: String,
    pub epoch: u64,
    pub member_count: usize,
    pub devices: Vec<DeviceView>,
}

pub(crate) async fn build_family_view(app: &tauri::AppHandle) -> Result<Option<FamilyView>> {
    let state = app.state::<AppState>();
    let db = state.db();

    let Some(row) = FamilyController::get_one(db).await? else {
        return Ok(None);
    };
    let roster = row.signed_roster()?;

    let runtime = state.family_runtime();
    let devices = PeerController::get_by_kind(db, PeerKind::Device)
        .await?
        .into_iter()
        .map(|peer| {
            let online = runtime
                .as_ref()
                .map(|r| r.is_online(&peer.endpoint_id))
                .unwrap_or(false);
            DeviceView { peer, online }
        })
        .collect();

    Ok(Some(FamilyView {
        family_id: row.family_id.clone(),
        epoch: row.epoch,
        member_count: roster.doc.members.len(),
        devices,
    }))
}

#[tauri::command]
pub async fn pair_device(
    endpoint_id: EndpointId,
    state: tauri::State<'_, AppState>,
) -> Result<usize> {
    let device = state.node()?.device.clone();

    let cache = state.peer_cache();
    let addr = cache
        .get(endpoint_id)
        .and_then(|p| p.addr)
        .unwrap_or_else(|| EndpointAddr::from(endpoint_id));

    device.invite(addr).await
}

#[tauri::command]
pub async fn answer_device_invite(
    session_id: usize,
    accepted: bool,
    state: tauri::State<'_, AppState>,
) -> Result<()> {
    if let Some((_, tx)) = state.device_invites().remove(&session_id) {
        let _ = tx.send(accepted);
    }

    Ok(())
}

#[tauri::command]
pub async fn cancel_pairing(session_id: usize, state: tauri::State<'_, AppState>) -> Result<()> {
    if let Some((_, tx)) = state.device_invites().remove(&session_id) {
        let _ = tx.send(false);
        return Ok(());
    }

    if let Ok(node) = state.node() {
        node.device.cancel(session_id);
    }

    Ok(())
}

#[tauri::command]
pub async fn kick_device(endpoint_id: EndpointId, state: tauri::State<'_, AppState>) -> Result<()> {
    let runtime = state.family_runtime().ok_or(Error::NoFamily)?;
    runtime.kick(endpoint_id).await
}

#[tauri::command]
pub async fn leave_family(force: bool, state: tauri::State<'_, AppState>) -> Result<()> {
    let runtime = state.family_runtime().ok_or(Error::NoFamily)?;
    runtime.leave(force).await
}

#[tauri::command]
pub async fn get_family(app: tauri::AppHandle) -> Result<Option<FamilyView>> {
    build_family_view(&app).await
}

#[tauri::command]
pub async fn list_devices(app: tauri::AppHandle) -> Result<Vec<DeviceView>> {
    Ok(build_family_view(&app)
        .await?
        .map(|view| view.devices)
        .unwrap_or_default())
}
