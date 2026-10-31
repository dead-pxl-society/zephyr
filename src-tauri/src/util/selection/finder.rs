use std::process::Command;

pub(super) fn selected_file_paths() -> Option<Vec<String>> {
    let script = r#"
    tell application "Finder"
        set theSelection to selection
        if theSelection is {} then return ""
        set thePaths to {}
        repeat with theItem in theSelection
            set end of thePaths to POSIX path of (theItem as alias)
        end repeat
        set AppleScript's text item delimiters to "\n"
        return thePaths as text
    end tell
    "#;

    let output = Command::new("osascript")
        .arg("-e")
        .arg(script)
        .output()
        .ok()?;

    if output.status.success() {
        let output_str = String::from_utf8_lossy(&output.stdout);
        let paths = output_str
            .lines()
            .map(|s| s.trim().to_string())
            .filter(|s| !s.is_empty())
            .collect::<Vec<_>>();
        Some(paths)
    } else {
        None
    }
}
