mod clipboard;
mod db;
mod discovery;
mod error;
mod events;
mod family;
mod menu;
mod net;
mod settings;
mod setup;
mod sharing;
mod shortcuts;
mod state;
mod transfer;
#[cfg(any(target_os = "windows", target_os = "linux"))]
mod tray;
mod util;
mod window;

use n0_future::{FuturesUnordered, StreamExt};
use tauri::{Manager, RunEvent, WindowEvent};
use tauri_plugin_dialog::{DialogExt, MessageDialogKind};

use crate::{error::Result, state::AppState, util::peer_cache::EphemeralPeer};

#[tauri::command]
fn list_cached_peers(state: tauri::State<'_, AppState>) -> Result<Vec<EphemeralPeer>> {
    let peer_cache = state.peer_cache();
    Ok(peer_cache.list())
}

#[tauri::command]
fn delete_all_parcels(state: tauri::State<'_, AppState>) -> Result<()> {
    let parcels = state.parcel_cache();
    parcels.delete_all();
    Ok(())
}

#[tauri::command]
async fn delete_resumable_transfers(app: tauri::AppHandle) -> Result<u64> {
    let temp_dir = app.path().temp_dir()?;
    let mut entries = tokio::fs::read_dir(&temp_dir).await?;
    let mut tasks = FuturesUnordered::new();

    while let Some(entry) = entries.next_entry().await? {
        let name = entry.file_name();
        if name.to_string_lossy().starts_with(".zephyr-recv") {
            tasks.push(tokio::fs::remove_dir_all(entry.path()));
        }
    }

    let mut deleted = 0u64;
    while let Some(result) = tasks.next().await {
        result?;
        deleted += 1;
    }

    Ok(deleted)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            // A second launch (Start menu, desktop shortcut) should surface the
            // running instance rather than silently doing nothing.
            window::raise_main_window(app);
        }))
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_os::init())
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .setup(|app| {
            let window = app
                .get_webview_window("main")
                .ok_or_else(|| error::Error::NoWindowWithLabel("main".to_string()))?;
            let window_hider = window.clone();

            let handle = app.handle().clone();

            #[cfg(not(target_os = "windows"))]
            {
                let menu = menu::create_menu(app.handle())?;
                app.set_menu(menu)?;
            }

            window::initialize_share_window(&handle)?;
            window::apply_window_vibrancy(&window);

            #[cfg(any(target_os = "windows", target_os = "linux"))]
            tray::create_tray(&handle)?;

            window.on_window_event(move |event| {
                if let WindowEvent::CloseRequested { api, .. } = event {
                    let _ = window_hider.hide();
                    api.prevent_close();
                }
            });

            let setup_handle = handle.clone();
            let result =
                tauri::async_runtime::block_on(async move { setup::initialize(&setup_handle).await });

            if let Err(e) = result {
                eprintln!("[setup] fatal: {e}");
                handle
                    .dialog()
                    .message(format!(
                        "Zephyr could not start.\n\n{e}\n\nIf this keeps happening, try restarting your computer or reinstalling the app."
                    ))
                    .title("Zephyr could not start")
                    .kind(MessageDialogKind::Error)
                    .blocking_show();
                return Err(Box::new(e));
            }

            Ok(())
        })
        .on_menu_event(menu::handle_menu_event)
        .invoke_handler(tauri::generate_handler![
            window::toggle_window,
            window::show_main_window,
            window::hide_window,
            window::is_window_focused,
            list_cached_peers,
            delete_all_parcels,
            delete_resumable_transfers,
            net::api::download,
            net::api::import,
            net::api::push,
            net::api::answer_share_request,
            net::api::cancel_share_request,
            net::api::delete_imported_tag,
            net::api::endpoint_ticket,
            db::api::user::update_user_cmd,
            db::api::user::get_one_user,
            db::api::config::set_clipboard_settings_cmd,
            db::api::config::get_config,
            db::api::transfer::create_transfer_cmd,
            db::api::transfer::get_transfers,
            db::api::transfer::get_transfer_count,
            db::api::transfer::delete_transfer,
            db::api::transfer::delete_all_transfers,
            db::api::peer::delete_stranger_peers,
            db::api::peer::add_contact,
            db::api::peer::get_peers,
            db::api::peer::get_peer_count,
            db::api::peer::update_peer,
            db::api::peer::endpoint_id_from_ticket,
            db::api::peer::add_contact_by_ticket_cmd,
            db::api::peer::block_peer,
            db::api::peer::unblock_peer,
            family::api::pair_device,
            family::api::answer_device_invite,
            family::api::cancel_pairing,
            family::api::kick_device,
            family::api::leave_family,
            family::api::get_family,
            family::api::list_devices,
            settings::open_notification_settings,
            shortcuts::update_shortcut,
            shortcuts::pause_shortcuts,
            shortcuts::resume_shortcuts,
            discovery::api::disable_mdns_cmd,
            discovery::api::enable_mdns_cmd,
            discovery::api::mdns_enabled_cmd,
            discovery::api::refresh_discovery_cmd,
        ])
        .build(tauri::generate_context!())
        .expect("error while running tauri application")
        .run(move |app, event| match event {
            #[cfg(target_os = "macos")]
            RunEvent::Reopen {
                has_visible_windows,
                ..
            } => {
                if !has_visible_windows && let Some(window) = app.get_webview_window("main") {
                    let _ = window.show();
                    let _ = window.set_focus();
                }
            }

            RunEvent::Ready => {
                if let Some(window) = app.get_webview_window("main") {
                    let _ = window.show();
                    let _ = window.set_focus();
                }
            }

            RunEvent::Exit => {
                let state = app.state::<AppState>();
                tauri::async_runtime::block_on(async {
                    let _ = tokio::time::timeout(std::time::Duration::from_secs(3), async {
                        if let Some(family) = state.family_runtime() {
                            family.leave_topic(true).await;
                        }

                        tokio::time::sleep(std::time::Duration::from_millis(300)).await;

                        if let Ok(node) = state.node() {
                            node.shutdown().await;
                        }
                    })
                    .await;
                });
            }

            _ => {}
        });
}
