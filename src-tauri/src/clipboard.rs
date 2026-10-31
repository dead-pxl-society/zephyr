use std::{
    path::{Path, PathBuf},
    sync::Arc,
};

use clipboard_rs::{
    Clipboard, ClipboardContext, ClipboardHandler, ClipboardWatcher, ClipboardWatcherContext,
};
use tauri::Manager;
use tokio::sync::{mpsc, watch};

use crate::{family::runtime::FamilyRuntime, state::AppState};

/// Not the `.zephyr-recv` prefix that `delete_resumable_transfers` wipes — that would
/// delete files the clipboard still points at.
pub const CLIP_DIR_PREFIX: &str = ".zephyr-clip-";

#[derive(Debug, Clone)]
pub enum ClipboardRead {
    Text(String),
    Files(Vec<PathBuf>),
}

#[derive(Debug)]
pub enum ClipboardWrite {
    Text(String),
    Files(Vec<PathBuf>),
}

pub fn clip_dir_name(content_id: u128) -> String {
    format!("{CLIP_DIR_PREFIX}{content_id:032x}")
}

fn content_id_from_clip_dir(dir: &Path) -> Option<u128> {
    let name = dir.file_name()?.to_str()?;
    let hex = name.strip_prefix(CLIP_DIR_PREFIX)?;
    u128::from_str_radix(hex, 16).ok()
}

/// Echo guard for the file case. Hashing the paths themselves cannot work: `set_files`
/// does not round-trip what it is given, so a receiver cannot predict what it will read
/// back. The directory name is ours, so it can.
pub fn clip_content_id(paths: &[PathBuf]) -> Option<u128> {
    let mut ids = paths
        .iter()
        .map(|p| p.parent().and_then(content_id_from_clip_dir));

    let first = ids.next().flatten()?;
    ids.all(|id| id == Some(first)).then_some(first)
}

/// X11 returns percent-encoded `file://` URIs where macOS and Windows return bare
/// paths, and clipboard-rs decodes neither.
fn normalize_clipboard_path(raw: &str) -> PathBuf {
    let Some(rest) = raw.strip_prefix("file://") else {
        return PathBuf::from(raw);
    };

    let bytes = rest.as_bytes();
    let mut decoded = Vec::with_capacity(bytes.len());
    let mut i = 0;
    while i < bytes.len() {
        if bytes[i] == b'%' && i + 2 < bytes.len() {
            let hex = std::str::from_utf8(&bytes[i + 1..i + 3]).ok();
            if let Some(byte) = hex.and_then(|h| u8::from_str_radix(h, 16).ok()) {
                decoded.push(byte);
                i += 3;
                continue;
            }
        }
        decoded.push(bytes[i]);
        i += 1;
    }

    PathBuf::from(String::from_utf8_lossy(&decoded).into_owned())
}

/// Reading a Universal Clipboard promise (`get_files`/`get_text`) forces Apple's Handoff
/// pull — the "copying…" popup and a multi-second stall. `available_formats` only lists
/// types, so it doesn't. The copy reaches us over our own channel regardless.
#[cfg(target_os = "macos")]
fn is_remote_clipboard(clipboard: &ClipboardContext) -> bool {
    clipboard
        .available_formats()
        .is_ok_and(|f| f.iter().any(|t| t == "com.apple.is-remote-clipboard"))
}

#[cfg(not(target_os = "macos"))]
fn is_remote_clipboard(_: &ClipboardContext) -> bool {
    false
}

struct Watcher {
    app: tauri::AppHandle,
    clipboard: ClipboardContext,
    tx: watch::Sender<Option<ClipboardRead>>,
}

impl ClipboardHandler for Watcher {
    fn on_clipboard_change(&mut self) {
        let Some(state) = self.app.try_state::<AppState>() else {
            return;
        };

        // Checked before the read: with sync off we must not touch clipboard content.
        if !state.clipboard_sync() {
            return;
        }

        if is_remote_clipboard(&self.clipboard) {
            return;
        }

        // Files before text: Finder's Copy puts both on the pasteboard, so text-first
        // would broadcast the filename as a string. `is_ok()` is not the discriminator —
        // X11 maps "no file list" to `Ok(vec![])` while macOS returns `Err`.
        if let Ok(raw) = self.clipboard.get_files()
            && !raw.is_empty()
        {
            if !state.clipboard_files() {
                return;
            }
            let paths = raw.iter().map(|p| normalize_clipboard_path(p)).collect();
            let _ = self.tx.send(Some(ClipboardRead::Files(paths)));
            return;
        }

        // A read error is how "the clipboard holds an image" shows up.
        let Ok(text) = self.clipboard.get_text() else {
            return;
        };

        if text.trim().is_empty() {
            return;
        }

        let _ = self.tx.send(Some(ClipboardRead::Text(text)));
    }
}

pub fn watch(app: tauri::AppHandle, tx: watch::Sender<Option<ClipboardRead>>) {
    let clipboard = match ClipboardContext::new() {
        Ok(clipboard) => clipboard,
        Err(e) => {
            eprintln!("[clipboard] failed to open clipboard, sync disabled: {e}");
            return;
        }
    };

    let mut watcher = match ClipboardWatcherContext::new() {
        Ok(watcher) => watcher,
        Err(e) => {
            eprintln!("[clipboard] failed to start watcher, sync disabled: {e}");
            return;
        }
    };

    watcher.add_handler(Watcher { app, clipboard, tx });

    watcher.start_watch();
}

/// Separate thread because `ClipboardContext` is not `Send`.
pub fn write_loop(mut rx: mpsc::UnboundedReceiver<ClipboardWrite>) {
    let clipboard = match ClipboardContext::new() {
        Ok(clipboard) => clipboard,
        Err(e) => {
            eprintln!("[clipboard] failed to open clipboard for writing: {e}");
            return;
        }
    };

    while let Some(write) = rx.blocking_recv() {
        let result = match write {
            ClipboardWrite::Text(text) => clipboard.set_text(text),
            ClipboardWrite::Files(paths) => {
                // macOS `set_files` clears the pasteboard before writing, so failing
                // afterwards would leave the user with nothing.
                if paths.iter().any(|p| !p.exists()) {
                    eprintln!("[clipboard] refusing to write files that no longer exist");
                    continue;
                }
                let paths = paths
                    .iter()
                    .map(|p| p.to_string_lossy().into_owned())
                    .collect();
                clipboard.set_files(paths)
            }
        };

        if let Err(e) = result {
            eprintln!("[clipboard] failed to write: {e}");
        }
    }
}

/// `watch` rather than mpsc, and `select!` on it: importing a large file takes seconds,
/// and only the newest copy matters.
pub async fn pump(runtime: Arc<FamilyRuntime>, mut rx: watch::Receiver<Option<ClipboardRead>>) {
    while rx.changed().await.is_ok() {
        let Some(read) = rx.borrow_and_update().clone() else {
            continue;
        };

        tokio::select! {
            _ = runtime.broadcast_clipboard(read) => {}
            _ = rx.changed() => {
                // Superseded mid-import. Abandon this one; the loop picks up the newer
                // value on the next iteration.
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn recognises_our_own_clip_directory() {
        let id = 0x1234_5678_9abc_def0_1234_5678_9abc_def0u128;
        let dir = PathBuf::from("/tmp").join(clip_dir_name(id));

        let paths = vec![dir.join("a.pdf"), dir.join("b.pdf")];
        assert_eq!(clip_content_id(&paths), Some(id));
    }

    #[test]
    fn rejects_anything_that_is_not_a_single_clip_directory() {
        let a = PathBuf::from("/tmp").join(clip_dir_name(1));
        let b = PathBuf::from("/tmp").join(clip_dir_name(2));

        // A genuine user selection.
        assert_eq!(clip_content_id(&[PathBuf::from("/home/me/x.pdf")]), None);
        // Mixing our directory with an outside file is a real copy, not an echo.
        assert_eq!(
            clip_content_id(&[a.join("x.pdf"), PathBuf::from("/home/me/y.pdf")]),
            None
        );
        // Two different clip directories are likewise a real selection.
        assert_eq!(clip_content_id(&[a.join("x.pdf"), b.join("y.pdf")]), None);
        assert_eq!(clip_content_id(&[]), None);
    }

    #[test]
    fn normalizes_linux_file_uris() {
        assert_eq!(
            normalize_clipboard_path("file:///home/me/a%20b.txt"),
            PathBuf::from("/home/me/a b.txt")
        );
        assert_eq!(
            normalize_clipboard_path("/home/me/a b.txt"),
            PathBuf::from("/home/me/a b.txt")
        );
        assert_eq!(
            normalize_clipboard_path("file:///home/me/%C3%A9.txt"),
            PathBuf::from("/home/me/é.txt")
        );
    }
}
