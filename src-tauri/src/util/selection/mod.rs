#[cfg(target_os = "windows")]
mod explorer;
#[cfg(target_os = "macos")]
mod finder;

pub fn get_selected_file_paths() -> Option<Vec<String>> {
    #[cfg(target_os = "macos")]
    {
        finder::selected_file_paths()
    }

    #[cfg(target_os = "windows")]
    {
        explorer::selected_file_paths()
    }

    #[cfg(target_os = "linux")]
    {
        None
    }
}
