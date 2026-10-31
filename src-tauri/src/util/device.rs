use serde::{Deserialize, Serialize};
use surrealdb::types::SurrealValue;

#[derive(Clone, Debug, Deserialize, Serialize, SurrealValue)]
#[serde(rename_all = "lowercase")]
#[surreal(untagged, rename_all = "lowercase")]
pub enum Platform {
    Windows,
    Macos,
    Linux,
    Android,
    Ios,
    Other,
}

impl Platform {
    pub fn from_tauri_platform(input: &str) -> Self {
        match input.to_lowercase().as_str() {
            "windows" => Self::Windows,
            "macos" => Self::Macos,
            "ios" => Self::Ios,
            "android" => Self::Android,
            "linux" | "freebsd" | "dragonfly" | "netbsd" | "openbsd" | "solaris" => Self::Linux,
            _ => Self::Other,
        }
    }
}

#[cfg(target_os = "macos")]
fn mac_pretty_name() -> Option<String> {
    use std::process::Command;
    if cfg!(target_os = "macos") {
        let output = Command::new("scutil")
            .args(["--get", "ComputerName"])
            .output()
            .ok()?;

        Some(String::from_utf8_lossy(&output.stdout).trim().to_string())
    } else {
        None
    }
}

#[cfg(target_os = "windows")]
fn windows_pretty_name() -> Option<String> {
    if cfg!(target_os = "windows") {
        std::env::var("COMPUTERNAME").ok()
    } else {
        None
    }
}

pub fn get_name() -> String {
    #[cfg(target_os = "macos")]
    {
        if let Some(name) = mac_pretty_name() {
            return name;
        }
    }

    #[cfg(target_os = "windows")]
    {
        if let Some(name) = windows_pretty_name() {
            return name;
        }
    }

    hostname::get()
        .map(|h| h.to_string_lossy().to_string())
        .unwrap_or_else(|_| "Unknown Device".to_string())
}

pub fn get_platform() -> Platform {
    let platform = tauri_plugin_os::platform();
    Platform::from_tauri_platform(platform)
}
