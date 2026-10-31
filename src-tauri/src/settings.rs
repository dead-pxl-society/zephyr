use tauri::AppHandle;

#[cfg(not(target_os = "windows"))]
use crate::error::Error;
use crate::error::Result;

#[tauri::command]
pub async fn open_notification_settings(app: AppHandle) -> Result<()> {
    open_settings(&app).await
}

#[cfg(not(target_os = "windows"))]
async fn run(program: &str, args: &[&str]) -> bool {
    tokio::process::Command::new(program)
        .args(args)
        .status()
        .await
        .is_ok_and(|status| status.success())
}

#[cfg(target_os = "macos")]
async fn open_settings(app: &AppHandle) -> Result<()> {
    let bundle_id = &app.config().identifier;

    let candidates = [
        format!(
            "x-apple.systempreferences:com.apple.Notifications-Settings.extension?id={bundle_id}"
        ),
        format!("x-apple.systempreferences:com.apple.preference.notifications?id={bundle_id}"),
        "x-apple.systempreferences:".to_string(),
    ];

    for url in &candidates {
        if run("open", &[url.as_str()]).await {
            return Ok(());
        }
    }

    Err(Error::SettingsUnavailable)
}

#[cfg(target_os = "windows")]
async fn open_settings(app: &AppHandle) -> Result<()> {
    use tauri_plugin_opener::OpenerExt;

    app.opener()
        .open_url("ms-settings:notifications", None::<&str>)?;

    Ok(())
}

#[cfg(target_os = "linux")]
async fn open_settings(_app: &AppHandle) -> Result<()> {
    let candidates: [(&str, &[&str]); 5] = [
        ("gnome-control-center", &["notifications"]),
        ("systemsettings", &["kcm_notifications"]),
        ("systemsettings5", &["kcm_notifications"]),
        ("xfce4-notifyd-config", &[]),
        ("gnome-control-center", &["applications"]),
    ];

    for (program, args) in candidates {
        if run(program, args).await {
            return Ok(());
        }
    }

    Err(Error::SettingsUnavailable)
}
