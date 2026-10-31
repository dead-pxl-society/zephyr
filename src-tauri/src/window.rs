use std::time::Duration;

use tauri::{Manager, WebviewWindow, WindowEvent};

use crate::error::{Error, Result};

#[cfg(target_os = "windows")]
fn parse_windows_version(version: &impl ToString) -> (u32, u32, u32) {
    let version = version.to_string();
    let mut parts = version.split('.');

    let major = parts.next().unwrap_or("0").parse().unwrap_or(0);
    let minor = parts.next().unwrap_or("0").parse().unwrap_or(0);
    let build = parts.next().unwrap_or("0").parse().unwrap_or(0);

    (major, minor, build)
}

pub fn apply_window_vibrancy(window: &WebviewWindow) {
    let platform = tauri_plugin_os::platform();
    let version = tauri_plugin_os::version();

    #[cfg(target_os = "macos")]
    if platform == "macos" {
        use window_vibrancy::{
            NSGlassEffectViewStyle, NSVisualEffectMaterial, apply_liquid_glass, apply_vibrancy,
        };

        let major_version = version
            .to_string()
            .split('.')
            .next()
            .unwrap_or("0")
            .parse::<u32>()
            .unwrap_or(0);

        if major_version >= 26 {
            if let Err(e) =
                apply_liquid_glass(window, NSGlassEffectViewStyle::Clear, None, Some(26.0))
            {
                eprintln!("[window] failed to apply liquid glass: {e}");
            }
        } else if let Err(e) = apply_vibrancy(
            window,
            NSVisualEffectMaterial::UnderWindowBackground,
            None,
            Some(16.0),
        ) {
            eprintln!("[window] failed to apply vibrancy: {e}");
        }

        return;
    }

    #[cfg(target_os = "windows")]
    if platform == "windows" {
        use window_vibrancy::{apply_acrylic, apply_blur, apply_mica};

        let (major, _minor, build) = parse_windows_version(&version);

        let result = if major > 10 || (major == 10 && build >= 22000) {
            apply_mica(window, None)
        } else if major == 10 {
            apply_acrylic(window, Some((18, 18, 18, 125)))
        } else {
            apply_blur(window, Some((18, 18, 18, 125)))
        };

        if let Err(e) = result {
            eprintln!("[window] failed to apply window effect: {e}");
        }

        return;
    }

    println!("No vibrancy available for platform: {}", platform);
}

pub(crate) fn initialize_share_window(app: &tauri::AppHandle) -> Result<()> {
    let file_path = "src/app/share/index.html";

    #[cfg(target_os = "macos")]
    let window =
        tauri::WebviewWindowBuilder::new(app, "share", tauri::WebviewUrl::App(file_path.into()))
            .title("")
            .title_bar_style(tauri::TitleBarStyle::Transparent)
            .decorations(false)
            .inner_size(448.0, 512.0)
            .hidden_title(true)
            .always_on_top(true)
            .resizable(false)
            .transparent(true)
            .build()?;

    #[cfg(not(target_os = "macos"))]
    let window =
        tauri::WebviewWindowBuilder::new(app, "share", tauri::WebviewUrl::App(file_path.into()))
            .title("Zephyr Share")
            .decorations(false)
            .inner_size(448.0, 512.0)
            .always_on_top(true)
            .resizable(false)
            .transparent(true)
            .build()?;

    let window_hider = window.clone();
    let _ = window_hider.hide();
    window.on_window_event(move |event| {
        if let WindowEvent::CloseRequested { api, .. } = event {
            let _ = window_hider.hide();
            api.prevent_close();
        }
    });
    apply_window_vibrancy(&window);

    Ok(())
}

pub(crate) fn show_window(window: &tauri::WebviewWindow) {
    let _ = window.show();
    let _ = window.set_visible_on_all_workspaces(true);
    let _ = window.set_focus();

    // Couldn't find a way to display window in the current workspace,
    // so I made this workaround, should research more to find a better
    // solution
    let window_clone = window.clone();
    std::thread::spawn(move || {
        std::thread::sleep(Duration::from_millis(50));
        let _ = window_clone.set_visible_on_all_workspaces(false);
    });
}

pub(crate) fn toggle_window_visibility(window: &tauri::WebviewWindow) {
    if window.is_visible().unwrap_or(false) {
        let _ = window.hide();
        return;
    }

    show_window(window);
}

#[tauri::command]
pub(crate) fn hide_window(window: tauri::WebviewWindow) {
    if !window.is_visible().unwrap_or(false) {
        return;
    }

    let _ = window.hide();
}

#[tauri::command]
pub(crate) fn is_window_focused(window: tauri::WebviewWindow) -> bool {
    window.is_focused().unwrap_or(false)
}

#[tauri::command]
pub(crate) fn toggle_window(label: String, app: tauri::AppHandle) -> Result<()> {
    let window = app
        .get_webview_window(&label)
        .ok_or(Error::NoWindowWithLabel(label))?;

    toggle_window_visibility(&window);

    Ok(())
}

#[tauri::command]
pub(crate) fn show_main_window(app: tauri::AppHandle) -> Result<()> {
    let window = app
        .get_webview_window("main")
        .ok_or(Error::NoWindowWithLabel("main".to_string()))?;

    show_window(&window);

    Ok(())
}

/// Brings the main window back to the front from a hidden or minimized state.
/// Used by the tray menu and by a second launch of the app.
pub(crate) fn raise_main_window(app: &tauri::AppHandle) {
    let Some(window) = app.get_webview_window("main") else {
        return;
    };

    let _ = window.unminimize();
    show_window(&window);
}
