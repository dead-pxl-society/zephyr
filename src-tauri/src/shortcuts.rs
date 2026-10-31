use surrealdb::{Surreal, engine::local::Db};
use tauri::{Emitter, Manager};

use tauri_plugin_global_shortcut::{GlobalShortcutExt, ShortcutState};

use crate::{
    db::model::{
        Controller,
        user::{ShortcutConfig, ShortcutConfigPatch, User, UserController, UserPatch},
    },
    error::{Error, Result},
    state::AppState,
};

async fn save(db: &Surreal<Db>, id: &str, shortcut_patch: ShortcutConfigPatch) -> Result<()> {
    let patch = UserPatch {
        shortcuts: Some(shortcut_patch),
        ..Default::default()
    };
    UserController::update(db, id, &patch).await?;

    Ok(())
}

fn ensure_unregistered(app: &tauri::AppHandle, shortcut: &str) {
    let gs = app.global_shortcut();
    if gs.is_registered(shortcut) {
        let _ = gs.unregister(shortcut);
    }
}

fn register_share(app: &tauri::AppHandle, shortcut: &str) -> Result<()> {
    ensure_unregistered(app, shortcut);
    let gs = app.global_shortcut();

    gs.on_shortcut(shortcut, move |app, _shortcut, event| {
        if let ShortcutState::Pressed = event.state() {
            let selected_files = crate::util::selection::get_selected_file_paths();
            if let Some(files) = selected_files {
                crate::sharing::handle_share_shortcut(files, app);
            } else if let Some(share_window) = app.get_webview_window("share") {
                crate::window::toggle_window_visibility(&share_window);
            }
        }
    })
    .map_err(|e| Error::Shortcut(e.to_string()))?;
    Ok(())
}

fn register_receive(app: &tauri::AppHandle, shortcut: &str) -> Result<()> {
    ensure_unregistered(app, shortcut);
    let gs = app.global_shortcut();

    gs.on_shortcut(shortcut, move |app, _shortcut, event| {
        if let ShortcutState::Pressed = event.state() {
            tauri::async_runtime::spawn({
                let recv_handle = app.clone();
                async move {
                    let _ = crate::sharing::handle_receive(&recv_handle).await;
                }
            });
        }
    })
    .map_err(|e| Error::Shortcut(e.to_string()))?;
    Ok(())
}

fn register_accept(app: &tauri::AppHandle, shortcut: &str) -> Result<()> {
    ensure_unregistered(app, shortcut);
    let gs = app.global_shortcut();

    gs.on_shortcut(shortcut, move |app, _shortcut, event| {
        if let ShortcutState::Pressed = event.state() {
            tauri::async_runtime::spawn({
                let handle = app.clone();
                async move {
                    let _ = handle.emit("shortcut:accept", "");
                }
            });
        }
    })
    .map_err(|e| Error::Shortcut(e.to_string()))?;
    Ok(())
}

fn register_reject(app: &tauri::AppHandle, shortcut: &str) -> Result<()> {
    ensure_unregistered(app, shortcut);
    let gs = app.global_shortcut();

    gs.on_shortcut(shortcut, move |app, _shortcut, event| {
        if let ShortcutState::Pressed = event.state() {
            tauri::async_runtime::spawn({
                let handle = app.clone();
                async move {
                    let _ = handle.emit("shortcut:reject", "");
                }
            });
        }
    })
    .map_err(|e| Error::Shortcut(e.to_string()))?;
    Ok(())
}

type RegisterFn = fn(&tauri::AppHandle, &str) -> Result<()>;

pub fn register_all(app: &tauri::AppHandle, shortcuts: &ShortcutConfig) -> Result<()> {
    let registrations: [(&str, RegisterFn); 4] = [
        (shortcuts.share.as_str(), register_share),
        (shortcuts.receive.as_str(), register_receive),
        (shortcuts.accept.as_str(), register_accept),
        (shortcuts.reject.as_str(), register_reject),
    ];

    for (shortcut, register) in registrations {
        if let Err(err) = register(app, shortcut) {
            eprintln!("Failed to register global shortcut `{shortcut}`: {err}");
        }
    }

    Ok(())
}

pub fn pause(app: &tauri::AppHandle) -> Result<()> {
    let gs = app.global_shortcut();
    gs.unregister_all()
        .map_err(|e| Error::Shortcut(e.to_string()))?;
    Ok(())
}

pub async fn update(
    app: &tauri::AppHandle,
    db: &Surreal<Db>,
    action: &str,
    new_shortcut: &str,
    loaded_user: Option<User>,
) -> Result<ShortcutConfig> {
    let gs = app.global_shortcut();
    let user = match loaded_user {
        Some(u) => u,
        None => {
            let user_opt = UserController::get_one(db).await?;
            user_opt.ok_or(Error::Shortcut(
                "Can't find default user config, can't load shortcuts.".to_string(),
            ))?
        }
    };
    let mut config = user.shortcuts;

    let patch = match action {
        "share" => {
            let _ = gs.unregister(config.share.as_str());
            register_share(app, new_shortcut)?;
            config.share = new_shortcut.to_string();
            ShortcutConfigPatch {
                share: Some(new_shortcut.to_string()),
                receive: None,
                accept: None,
                reject: None,
            }
        }
        "receive" => {
            let _ = gs.unregister(config.receive.as_str());
            register_receive(app, new_shortcut)?;
            config.receive = new_shortcut.to_string();
            ShortcutConfigPatch {
                share: None,
                receive: Some(new_shortcut.to_string()),
                accept: None,
                reject: None,
            }
        }
        "accept" => {
            let _ = gs.unregister(config.accept.as_str());
            register_accept(app, new_shortcut)?;
            config.accept = new_shortcut.to_string();
            ShortcutConfigPatch {
                share: None,
                receive: None,
                accept: Some(new_shortcut.to_string()),
                reject: None,
            }
        }
        "reject" => {
            let _ = gs.unregister(config.reject.as_str());
            register_reject(app, new_shortcut)?;
            config.reject = new_shortcut.to_string();
            ShortcutConfigPatch {
                share: None,
                receive: None,
                accept: None,
                reject: Some(new_shortcut.to_string()),
            }
        }
        _ => {
            return Err(Error::Shortcut(format!(
                "Unknown shortcut action: {action}"
            )));
        }
    };

    save(db, &user.id.to_string(), patch).await?;

    Ok(config)
}

#[tauri::command]
pub async fn update_shortcut(
    app: tauri::AppHandle,
    state: tauri::State<'_, AppState>,
    action: String,
    shortcut: String,
    user: Option<User>,
) -> Result<ShortcutConfig> {
    let db = state.db();
    update(&app, db, &action, &shortcut, user).await
}

#[tauri::command]
pub fn pause_shortcuts(app: tauri::AppHandle) -> Result<()> {
    pause(&app)
}

#[tauri::command]
pub fn resume_shortcuts(app: tauri::AppHandle, shortcuts: ShortcutConfig) -> Result<()> {
    register_all(&app, &shortcuts)
}
