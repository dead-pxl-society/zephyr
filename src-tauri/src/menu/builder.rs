use tauri::{
    Wry,
    menu::{Menu, MenuItem, PredefinedMenuItem, Submenu},
};

use crate::util::translations::Translations;

use super::{
    DELETE_PARCELS, DELETE_STRANGERS, DELETE_TRANSFERS, RECEIVE_CLIPBOARD, SETTINGS, SHARE_FILES,
};

pub fn create_menu(app: &tauri::AppHandle) -> tauri::Result<Menu<Wry>> {
    let t = Translations::from_system_locale();

    let menu = Menu::default(app)?;
    let app_menu = Submenu::with_items(
        app,
        "Zephyr",
        true,
        &[
            &PredefinedMenuItem::about(app, Some("About Zephyr"), None)?,
            &PredefinedMenuItem::separator(app)?,
            &MenuItem::with_id(
                app,
                SETTINGS,
                t.t("app_settings"),
                true,
                Some("CmdOrCtrl+,"),
            )?,
            &PredefinedMenuItem::separator(app)?,
            &PredefinedMenuItem::hide(app, None)?,
            &PredefinedMenuItem::hide_others(app, None)?,
            &PredefinedMenuItem::show_all(app, None)?,
            &PredefinedMenuItem::separator(app)?,
            &PredefinedMenuItem::quit(app, None)?,
        ],
    )?;

    let file_menu = Submenu::with_items(
        app,
        "File",
        true,
        &[
            &MenuItem::with_id(app, SHARE_FILES, t.t("file_share"), true, None::<&str>)?,
            &MenuItem::with_id(
                app,
                RECEIVE_CLIPBOARD,
                t.t("file_receive"),
                true,
                None::<&str>,
            )?,
            &PredefinedMenuItem::separator(app)?,
            &PredefinedMenuItem::close_window(app, None)?,
        ],
    )?;

    let storage_menu = Submenu::with_items(
        app,
        "Storage",
        true,
        &[
            &MenuItem::with_id(
                app,
                DELETE_TRANSFERS,
                t.t("delete_transfers"), // "Delete All Transfers",
                true,
                None::<&str>,
            )?,
            &MenuItem::with_id(
                app,
                DELETE_STRANGERS,
                t.t("delete_strangers"), // "Delete Unknown Peers",
                true,
                None::<&str>,
            )?,
            &MenuItem::with_id(
                app,
                DELETE_PARCELS,
                t.t("delete_parcels"), //"Delete all Parcels",
                true,
                None::<&str>,
            )?,
        ],
    )?;

    menu.remove_at(0)?; // Remove app menu
    menu.remove_at(0)?; // Remove default file menu

    menu.prepend(&app_menu)?;

    menu.insert(&file_menu, 1)?;
    menu.insert(&storage_menu, 2)?;
    Ok(menu)
}
