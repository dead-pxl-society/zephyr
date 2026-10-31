#[cfg(not(target_os = "windows"))]
mod builder;
mod handler;

#[cfg(not(target_os = "windows"))]
pub use builder::create_menu;
pub use handler::handle_menu_event;

pub const SHARE_FILES: &str = "share_files";
pub const RECEIVE_CLIPBOARD: &str = "receive_clipboard";
pub const DELETE_TRANSFERS: &str = "delete_transfers";
pub const DELETE_STRANGERS: &str = "delete_strangers";
pub const DELETE_PARCELS: &str = "delete_parcels";
pub const SETTINGS: &str = "settings";

#[cfg(any(target_os = "windows", target_os = "linux"))]
pub const TRAY_OPEN: &str = "tray_open";
#[cfg(any(target_os = "windows", target_os = "linux"))]
pub const TRAY_QUIT: &str = "tray_quit";
