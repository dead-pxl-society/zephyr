//! Launch at login. The user's preference lives on the local user row and is
//! the source of truth; the OS registration (Launch Agent on macOS, `Run`
//! registry key on Windows, XDG autostart entry on Linux) is reconciled to it
//! on every startup so that moving or reinstalling the app keeps the entry
//! pointing at the current executable.

use tauri_plugin_autostart::ManagerExt;

use crate::{
    AppState,
    db::{
        api::user::{get_single_user, update_user},
        model::user::{User, UserPatch},
    },
    error::{Error, Result},
};

/// Passed by the OS login entry so the app can tell a login launch apart from
/// one the user started by hand.
pub const LAUNCHED_AT_LOGIN_ARG: &str = "--autostart";

pub fn plugin() -> tauri::plugin::TauriPlugin<tauri::Wry> {
    tauri_plugin_autostart::Builder::new()
        .arg(LAUNCHED_AT_LOGIN_ARG)
        .build()
}

pub fn launched_at_login() -> bool {
    std::env::args().any(|arg| arg == LAUNCHED_AT_LOGIN_ARG)
}

fn apply(app: &tauri::AppHandle, enabled: bool) -> Result<()> {
    // Debug builds run from `target/`; registering that binary would leave a
    // login item behind that points at a dev build.
    if cfg!(debug_assertions) {
        return Ok(());
    }

    let manager = app.autolaunch();
    let current = manager
        .is_enabled()
        .map_err(|e| Error::Autostart(e.to_string()))?;

    // Re-enabling when already enabled rewrites the entry with the current
    // executable path, which is what keeps it valid across app moves/updates.
    let result = if enabled {
        manager.enable()
    } else if current {
        manager.disable()
    } else {
        Ok(())
    };

    result.map_err(|e| Error::Autostart(e.to_string()))
}

/// Brings the OS login entry in line with the stored preference.
pub fn sync(app: &tauri::AppHandle, user: &User) {
    if let Err(e) = apply(app, user.autostart) {
        eprintln!("[autostart] failed to sync login item: {e}");
    }
}

#[tauri::command]
pub async fn set_autostart_cmd(
    app: tauri::AppHandle,
    enabled: bool,
    state: tauri::State<'_, AppState>,
) -> Result<User> {
    let db = state.db();
    let user = get_single_user(db)
        .await?
        .ok_or(Error::StoreData("user".to_string()))?;

    apply(&app, enabled)?;

    let patch = UserPatch {
        autostart: Some(enabled),
        ..Default::default()
    };
    update_user(db, &user.id, &patch).await
}
