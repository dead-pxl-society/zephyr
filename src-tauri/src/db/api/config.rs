use tauri::{Emitter, Manager};

use crate::{
    AppState,
    db::model::config::{
        ConfigController, ConfigState, ConfigValue, ConfigView, KEY_CLIPBOARD_FILES,
        KEY_CLIPBOARD_MAX_BYTES, KEY_CLIPBOARD_SYNC,
    },
    error::{Error, Result},
};

pub fn publish_config(app: &tauri::AppHandle, config: &ConfigState) {
    let state = app.state::<AppState>();

    state.set_clipboard_sync(config.clipboard_sync());
    state.set_clipboard_files(config.clipboard_files());
    state.set_clipboard_max_bytes(config.clipboard_max_bytes());

    if !config.clipboard_sync() {
        state.set_last_clipboard(None);
    }

    let _ = app.emit("config_updated", config.view());
}

#[tauri::command]
pub async fn get_config(state: tauri::State<'_, AppState>) -> Result<ConfigView> {
    Ok(ConfigController::state(state.db()).await?.view())
}

#[tauri::command]
pub async fn set_clipboard_settings_cmd(
    app: tauri::AppHandle,
    sync: Option<bool>,
    files: Option<bool>,
    max_bytes: Option<u64>,
    state: tauri::State<'_, AppState>,
) -> Result<ConfigView> {
    let db = state.db();
    let runtime = state.family_runtime().ok_or(Error::NodeUnavailable)?;
    let author = runtime.endpoint_id();

    let mut config = ConfigController::state(db).await?;
    let mut changed = Vec::new();

    if let Some(value) = sync {
        changed.push(config.set(KEY_CLIPBOARD_SYNC, ConfigValue::Bool(value), author));
    }
    if let Some(value) = files {
        changed.push(config.set(KEY_CLIPBOARD_FILES, ConfigValue::Bool(value), author));
    }
    if let Some(value) = max_bytes {
        changed.push(config.set(KEY_CLIPBOARD_MAX_BYTES, ConfigValue::U64(value), author));
    }

    if changed.is_empty() {
        return Ok(config.view());
    }

    ConfigController::set_state(db, &config).await?;
    publish_config(&app, &config);
    runtime.broadcast_config(&changed).await;

    Ok(config.view())
}
