use tauri::Manager;

use crate::{
    discovery::mdns::{disable_mdns, enable_mdns, recycle_mdns},
    error::Result,
    state::AppState,
};

#[tauri::command]
pub async fn mdns_enabled_cmd(app: tauri::AppHandle) -> Result<bool> {
    let state = app.state::<AppState>();

    Ok(state.node()?.mdns_enabled())
}

#[tauri::command]
pub async fn disable_mdns_cmd(app: tauri::AppHandle) -> Result<()> {
    disable_mdns(&app).await
}

#[tauri::command]
pub async fn enable_mdns_cmd(app: tauri::AppHandle) -> Result<()> {
    enable_mdns(&app).await
}

/// Manual recovery for everything that finds other devices: a fresh mDNS
/// socket and a fresh gossip membership. Safe to call at any time.
#[tauri::command]
pub async fn refresh_discovery_cmd(app: tauri::AppHandle) -> Result<()> {
    recycle_mdns(&app).await;

    if let Some(runtime) = app.state::<AppState>().family_runtime() {
        runtime.refresh().await;
    }

    Ok(())
}
