use windows::Win32::System::Com::{
    CLSCTX_ALL, COINIT_APARTMENTTHREADED, CoCreateInstance, CoInitializeEx, CoUninitialize,
    IDispatch, IServiceProvider,
};
use windows::Win32::System::Variant::{VARIANT, VT_I4};
use windows::Win32::UI::Shell::{
    IShellBrowser, IShellFolderViewDual, IShellWindows, IWebBrowser2, SID_STopLevelBrowser,
    SVGIO_BACKGROUND, SWC_DESKTOP, SWFO_NEEDDISPATCH, ShellWindows,
};
use windows::Win32::UI::WindowsAndMessaging::GetForegroundWindow;
use windows::core::Interface;

fn index(value: i32) -> VARIANT {
    let mut variant = VARIANT::default();
    unsafe {
        let inner = &mut *variant.Anonymous.Anonymous;
        inner.vt = VT_I4;
        inner.Anonymous.lVal = value;
    }
    variant
}

fn selected_paths(view: &IShellFolderViewDual) -> Option<Vec<String>> {
    unsafe {
        let items = view.SelectedItems().ok()?;
        let count = items.Count().ok()?;
        let mut paths = Vec::with_capacity(count.max(0) as usize);

        for i in 0..count {
            let Ok(item) = items.Item(&index(i)) else {
                continue;
            };
            let Ok(path) = item.Path() else {
                continue;
            };

            let path = path.to_string();
            if !path.is_empty() {
                paths.push(path);
            }
        }

        Some(paths)
    }
}

// The desktop is a shell view like any other, but it is not part of the
// ShellWindows collection, so it has to be asked for by class.
fn desktop_view(shell_windows: &IShellWindows) -> Option<(usize, IShellFolderViewDual)> {
    unsafe {
        let location = VARIANT::default();
        let root = VARIANT::default();
        let mut hwnd = 0i32;

        let dispatch = shell_windows
            .FindWindowSW(&location, &root, SWC_DESKTOP, &mut hwnd, SWFO_NEEDDISPATCH)
            .ok()?;

        let browser: IShellBrowser = dispatch
            .cast::<IServiceProvider>()
            .ok()?
            .QueryService(&SID_STopLevelBrowser)
            .ok()?;

        // The desktop view does not hand out its automation interface through
        // QueryInterface, it has to be asked for as the background item object.
        let view = browser
            .QueryActiveShellView()
            .ok()?
            .GetItemObject::<IDispatch>(SVGIO_BACKGROUND)
            .ok()?
            .cast()
            .ok()?;

        Some((hwnd as u32 as usize, view))
    }
}

fn collect() -> Option<Vec<String>> {
    unsafe {
        let shell_windows: IShellWindows =
            CoCreateInstance(&ShellWindows, None, CLSCTX_ALL).ok()?;
        let foreground = GetForegroundWindow().0 as usize;
        let mut fallback = None;

        let count = shell_windows.Count().unwrap_or(0);
        for i in 0..count {
            let Ok(dispatch) = shell_windows.Item(&index(i)) else {
                continue;
            };
            let Ok(browser) = dispatch.cast::<IWebBrowser2>() else {
                continue;
            };

            // Browsers register here too, only file system views have a file: URL.
            let Ok(url) = browser.LocationURL() else {
                continue;
            };
            if !url.to_string().starts_with("file:") {
                continue;
            }

            let Ok(document) = browser.Document() else {
                continue;
            };
            let Ok(view) = document.cast::<IShellFolderViewDual>() else {
                continue;
            };

            let is_foreground = browser.HWND().is_ok_and(|h| h.0 as usize == foreground);
            if is_foreground {
                return selected_paths(&view);
            }

            fallback.get_or_insert(view);
        }

        if let Some((hwnd, view)) = desktop_view(&shell_windows) {
            if hwnd == foreground {
                return selected_paths(&view);
            }

            // The desktop keeps its selection while another app has focus, so a live
            // one beats whatever is still highlighted in a background window.
            match selected_paths(&view) {
                Some(paths) if !paths.is_empty() => return Some(paths),
                _ => {}
            }
        }

        fallback.as_ref().and_then(selected_paths)
    }
}

pub(super) fn selected_file_paths() -> Option<Vec<String>> {
    // COM apartments are per thread, so own the thread we call from instead of
    // depending on how the shortcut callback thread happens to be initialized.
    std::thread::spawn(|| unsafe {
        if CoInitializeEx(None, COINIT_APARTMENTTHREADED).is_err() {
            return None;
        }

        let paths = collect();
        CoUninitialize();
        paths
    })
    .join()
    .ok()
    .flatten()
}
