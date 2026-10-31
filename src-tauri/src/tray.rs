//! System tray for platforms without a persistent app presence once the main
//! window is hidden. On macOS the dock keeps the app reachable (see the
//! `RunEvent::Reopen` handler), so the tray is only built for Windows and Linux.

use tauri::{
    menu::{Menu, MenuItem, PredefinedMenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
};

use crate::{
    menu::{TRAY_OPEN, TRAY_QUIT},
    util::translations::Translations,
};

pub(crate) fn create_tray(app: &tauri::AppHandle) -> tauri::Result<()> {
    let t = Translations::from_system_locale();

    let menu = Menu::with_items(
        app,
        &[
            &MenuItem::with_id(app, TRAY_OPEN, t.t("tray_open"), true, None::<&str>)?,
            &PredefinedMenuItem::separator(app)?,
            &MenuItem::with_id(app, TRAY_QUIT, t.t("tray_quit"), true, None::<&str>)?,
        ],
    )?;

    let mut builder = TrayIconBuilder::with_id("main")
        .menu(&menu)
        .tooltip("Zephyr")
        // Left click opens the window, right click opens the menu. Unsupported
        // on Linux, where any click opens the menu instead - which is why both
        // actions have to live in the menu and not only on the click handler.
        .show_menu_on_left_click(false)
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } = event
            {
                crate::window::raise_main_window(tray.app_handle());
            }
        });

    if let Some(icon) = app.default_window_icon().cloned() {
        builder = builder.icon(icon);
    }

    builder.build(app)?;

    Ok(())
}
