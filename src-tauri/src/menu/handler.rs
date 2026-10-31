use tauri::{Emitter, Manager, menu::MenuEvent};

use crate::{
    db::model::{peer::PeerController, transfer::TransferController},
    state::AppState,
};

use super::{
    DELETE_PARCELS, DELETE_STRANGERS, DELETE_TRANSFERS, RECEIVE_CLIPBOARD, SETTINGS, SHARE_FILES,
};

#[cfg(any(target_os = "windows", target_os = "linux"))]
use super::{TRAY_OPEN, TRAY_QUIT};

pub fn handle_menu_event(app: &tauri::AppHandle, event: MenuEvent) {
    match event.id().as_ref() {
        SHARE_FILES => {
            let selected_files = crate::util::selection::get_selected_file_paths();
            if let Some(files) = selected_files {
                crate::sharing::handle_share_shortcut(files, app);
            } else if let Some(share_window) = app.get_webview_window("share") {
                crate::window::toggle_window_visibility(&share_window);
            }
        }

        RECEIVE_CLIPBOARD => {
            tauri::async_runtime::spawn({
                let handle = app.clone();
                async move {
                    let _ = crate::sharing::handle_receive(&handle).await;
                }
            });
        }

        DELETE_PARCELS => {
            let state = app.state::<AppState>();
            state.parcel_cache().delete_all();
            let _ = app.emit("sys_menu:deleted_parcels", "");
        }

        DELETE_TRANSFERS => {
            let state = app.state::<AppState>();
            let db = state.db().clone();

            let emit_handle = app.clone();
            tauri::async_runtime::spawn(async move {
                if let Err(e) = TransferController::delete_all(&db).await {
                    eprintln!("Failed to clear transfers: {e}");
                } else {
                    let _ = emit_handle.emit("sys_menu:deleted_transfers", "");
                }
            });
        }

        DELETE_STRANGERS => {
            let state = app.state::<AppState>();
            let db = state.db().clone();
            tauri::async_runtime::spawn(async move {
                if let Err(e) = PeerController::delete_strangers(&db).await {
                    eprintln!("Failed to delete stranger peers: {e}");
                }
            });
        }

        SETTINGS => {
            let _ = app.emit("sys_menu:navigate", "settings");
        }

        #[cfg(any(target_os = "windows", target_os = "linux"))]
        TRAY_OPEN => {
            crate::window::raise_main_window(app);
        }

        // `exit` runs the `RunEvent::Exit` cleanup and does not emit a window
        // `CloseRequested`, so the main window's `prevent_close` won't block it.
        #[cfg(any(target_os = "windows", target_os = "linux"))]
        TRAY_QUIT => {
            app.exit(0);
        }

        _ => {}
    }
}
