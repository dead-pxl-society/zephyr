//! Native notifications through `zephyr-notify`.
//!
//! The frontend decides when to notify, since translated text and pending requests live
//! there. Button presses are forwarded back to it as `notification:event`.

use std::sync::mpsc::{self, Receiver};

use dashmap::DashMap;
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter, Manager, State};
use zephyr_notify::{
    Action, Event, Notification, NotificationHandle, Notifier, Permission, Progress,
    ProgressSupport,
};

use crate::{
    error::{Error, Result},
    window::raise_main_window,
};

/// Embedded because Windows and Linux need an icon file on disk and the notifier starts
/// before Tauri can resolve any of its paths.
#[cfg(not(target_os = "macos"))]
const ICON: &[u8] = include_bytes!("../icons/128x128@2x.png");

pub(crate) struct Notifications {
    /// `None` where the OS service is unavailable, including `tauri dev` on macOS, which
    /// has no app bundle. Notifications are then skipped.
    notifier: Option<Notifier>,
    handles: DashMap<String, NotificationHandle>,
    /// Progress is only shown where the OS draws a real bar. Elsewhere it would be a line of
    /// text that, on macOS, never stays on screen, so a transfer just gets a start and an end.
    native_progress: bool,
}

/// Starts the notifier. Runs before `tauri::Builder` so that macOS and Windows can
/// deliver a button press that launched the app.
pub(crate) fn init(app_id: &str, app_name: &str) -> (Notifications, Receiver<Event>) {
    let (events_tx, events_rx) = mpsc::channel();
    let builder = Notifier::builder(app_id)
        .app_name(app_name)
        .on_event(move |event| drop(events_tx.send(event)));

    #[cfg(not(target_os = "macos"))]
    let builder = {
        let path = std::env::temp_dir().join(format!("{app_id}-notification-icon.png"));
        match std::fs::write(&path, ICON) {
            Ok(()) => builder.icon(path),
            Err(e) => {
                eprintln!("[notifications] couldn't write icon: {e}");
                builder
            }
        }
    };

    let notifier = builder
        .build()
        .inspect_err(|e| eprintln!("[notifications] unavailable: {e}"))
        .ok();
    let native_progress = notifier
        .as_ref()
        .is_some_and(|n| n.capabilities().progress == ProgressSupport::Native);
    let notifications = Notifications {
        notifier,
        handles: DashMap::new(),
        native_progress,
    };
    (notifications, events_rx)
}

/// Forwards OS notification events until the app exits.
pub(crate) fn forward_events(app: AppHandle, events: Receiver<Event>) {
    std::thread::spawn(move || {
        for event in events {
            app.state::<Notifications>().handles.remove(event.id());
            match event {
                Event::Activated { .. } => raise_main_window(&app),
                Event::Action { id, action_id, .. } => {
                    let payload = NotificationAction { id, action_id };
                    let _ = app.emit_to("main", "notification:action", payload);
                }
                _ => {}
            }
        }
    });
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub enum NotificationPermission {
    Granted,
    Denied,
    NotDetermined,
    /// There's no notification service, such as under `tauri dev` on macOS.
    Unavailable,
}

impl From<Permission> for NotificationPermission {
    fn from(permission: Permission) -> Self {
        match permission {
            Permission::Granted => Self::Granted,
            Permission::NotDetermined => Self::NotDetermined,
            _ => Self::Denied,
        }
    }
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct NotificationAction {
    id: String,
    action_id: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NotificationButton {
    id: String,
    label: String,
    #[serde(default)]
    destructive: bool,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NotificationRequest {
    id: String,
    title: String,
    body: Option<String>,
    #[serde(default)]
    actions: Vec<NotificationButton>,
    #[serde(default)]
    persistent: bool,
    /// Starts the notification with a progress bar at this fraction.
    progress: Option<f64>,
}

impl From<NotificationRequest> for Notification {
    fn from(request: NotificationRequest) -> Self {
        let mut notification = Notification::new(request.title)
            .id(request.id)
            .persistent(request.persistent);
        notification.body = request.body;
        notification.progress = request.progress.map(Progress::fraction);
        notification.actions = request
            .actions
            .into_iter()
            .map(|button| {
                let action = Action::button(button.id, button.label);
                if button.destructive {
                    action.destructive()
                } else {
                    action
                }
            })
            .collect();
        notification
    }
}

/// Runs an OS call off the main thread and any async worker, since it waits for a reply.
async fn blocking<T: Send + 'static>(
    call: impl FnOnce() -> zephyr_notify::Result<T> + Send + 'static,
) -> zephyr_notify::Result<T> {
    tauri::async_runtime::spawn_blocking(call)
        .await
        .map_err(|e| zephyr_notify::Error::Backend(e.to_string()))?
}

fn to_error(error: zephyr_notify::Error) -> Error {
    Error::Notification(error.to_string())
}

/// Returns whether the notification was shown.
#[tauri::command]
pub async fn show_notification(
    request: NotificationRequest,
    state: State<'_, Notifications>,
) -> Result<bool> {
    let Some(notifier) = state.notifier.clone() else {
        return Ok(false);
    };
    let mut request = request;
    if !state.native_progress {
        request.progress = None;
    }
    let id = request.id.clone();
    match blocking(move || notifier.show(request.into())).await {
        Ok(handle) => {
            state.handles.insert(id, handle);
            Ok(true)
        }
        Err(zephyr_notify::Error::PermissionDenied) => Ok(false),
        Err(error) => Err(to_error(error)),
    }
}

#[tauri::command]
pub async fn close_notification(id: String, state: State<'_, Notifications>) -> Result<()> {
    state.handles.remove(&id);
    let Some(notifier) = state.notifier.clone() else {
        return Ok(());
    };
    blocking(move || notifier.close(&id))
        .await
        .map_err(to_error)
}

#[tauri::command]
pub async fn notification_permission(
    state: State<'_, Notifications>,
) -> Result<NotificationPermission> {
    let Some(notifier) = state.notifier.clone() else {
        return Ok(NotificationPermission::Unavailable);
    };
    let permission = blocking(move || notifier.permission())
        .await
        .map_err(to_error)?;
    Ok(permission.into())
}

/// Waits for the user to answer the OS prompt where there is one.
#[tauri::command]
pub async fn request_notification_permission(
    state: State<'_, Notifications>,
) -> Result<NotificationPermission> {
    let Some(notifier) = state.notifier.clone() else {
        return Ok(NotificationPermission::Unavailable);
    };
    let permission = blocking(move || notifier.request_permission())
        .await
        .map_err(to_error)?;
    Ok(permission.into())
}

pub(crate) fn transfer_notification_id(transfer_id: u64) -> String {
    format!("transfer-{transfer_id}")
}

/// Updates a transfer's progress notification, if the frontend chose to show one.
pub(crate) async fn set_transfer_progress(app: &AppHandle, transfer_id: u64, fraction: f64) {
    let state = app.state::<Notifications>();
    if !state.native_progress {
        return;
    }
    let id = transfer_notification_id(transfer_id);
    let Some(handle) = state.handles.get(&id).map(|entry| entry.value().clone()) else {
        return;
    };
    let result = blocking(move || handle.set_progress(Progress::fraction(fraction))).await;
    if let Err(e) = result {
        eprintln!("[notifications] couldn't update progress: {e}");
    }
}
