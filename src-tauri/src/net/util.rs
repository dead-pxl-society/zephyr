use std::path::{Component, Path, PathBuf};

use walkdir::WalkDir;

use crate::error::{Error, Result};

/// This function converts an already canonicalized path to a string.
///
/// If `must_be_relative` is true, the function will fail if any component of the path is
/// `Component::RootDir`
///
/// This function will also fail if the path is non canonical, i.e. contains
/// `..` or `.`, or if the path components contain any windows or unix path
/// separators.
pub fn canonicalized_path_to_string(
    path: impl AsRef<Path>,
    must_be_relative: bool,
) -> Result<String> {
    let mut path_str = String::new();
    let parts = path
        .as_ref()
        .components()
        .filter_map(|c| match c {
            Component::Normal(x) => {
                let c = match x.to_str() {
                    Some(c) => c,
                    None => {
                        return Some(Err(Error::InvalidPath(
                            "invalid character in path".to_string(),
                        )));
                    }
                };

                if !c.contains('/') && !c.contains('\\') {
                    Some(Ok(c))
                } else {
                    Some(Err(Error::InvalidPath(format!(
                        "invalid path component {:?}",
                        c
                    ))))
                }
            }
            Component::RootDir => {
                if must_be_relative {
                    Some(Err(Error::InvalidPath(format!(
                        "invalid path component {:?}",
                        c
                    ))))
                } else {
                    path_str.push('/');
                    None
                }
            }
            _ => Some(Err(Error::InvalidPath(format!(
                "invalid path component {:?}",
                c
            )))),
        })
        .collect::<Result<Vec<_>>>()?;

    let parts = parts.join("/");
    path_str.push_str(&parts);

    Ok(path_str)
}

const WINDOWS_RESERVED: [&str; 22] = [
    "CON", "PRN", "AUX", "NUL", "COM1", "COM2", "COM3", "COM4", "COM5", "COM6", "COM7", "COM8",
    "COM9", "LPT1", "LPT2", "LPT3", "LPT4", "LPT5", "LPT6", "LPT7", "LPT8", "LPT9",
];

fn invalid_component(component: &str, reason: &str) -> Error {
    Error::InvalidPath(format!("invalid path component {component:?}: {reason}"))
}

/// Guards one segment of a peer-supplied path. `get_export_path` splits on `/` before
/// calling this, so rejecting only `/` would let `../../evil` through as three
/// individually-innocent segments.
pub fn validate_path_component(component: &str) -> Result<()> {
    if component.is_empty() {
        // Also covers a leading `/`, which would make the name absolute.
        return Err(invalid_component(component, "empty"));
    }

    if component == "." || component == ".." {
        return Err(invalid_component(component, "traverses the export root"));
    }

    if component.contains('/') || component.contains('\\') {
        return Err(invalid_component(component, "contains a path separator"));
    }

    if component.contains('\0') {
        return Err(invalid_component(component, "contains a null byte"));
    }

    // Blocks `C:` drive-relative paths and NTFS alternate data streams.
    if component.contains(':') {
        return Err(invalid_component(component, "contains a drive separator"));
    }

    let stem = component.split('.').next().unwrap_or(component);
    if WINDOWS_RESERVED
        .iter()
        .any(|reserved| stem.eq_ignore_ascii_case(reserved))
    {
        return Err(invalid_component(component, "is a reserved device name"));
    }

    Ok(())
}

pub fn get_export_path(root: &Path, name: &str) -> Result<PathBuf> {
    let parts = name.split('/');
    let mut path = root.to_path_buf();
    for part in parts {
        validate_path_component(part)?;
        path.push(part);
    }
    Ok(path)
}

pub fn paths_to_data_sources(paths: &Vec<PathBuf>) -> Result<Vec<(String, PathBuf)>> {
    let mut data_sources = Vec::new();

    for path in paths {
        let path = path.canonicalize()?;
        let root = path
            .parent()
            .ok_or_else(|| Error::NoParentForPath(path.to_path_buf()))?;

        if path.is_file() {
            let relative = path.strip_prefix(root)?;
            let name = canonicalized_path_to_string(relative, true)?;
            data_sources.push((name, path));
            continue;
        }

        let files = WalkDir::new(&path).into_iter();

        let mut dir_files = files
            .map(|entry| {
                let entry = entry?;
                if !entry.file_type().is_file() {
                    // Skip symlinks. Directories are handled by WalkDir.
                    return Ok(None);
                }
                let path = entry.into_path();
                let relative = path.strip_prefix(root)?;
                let name = canonicalized_path_to_string(relative, true)?;
                Ok(Some((name, path)))
            })
            .filter_map(Result::transpose)
            .collect::<Result<Vec<_>>>()?;

        data_sources.append(&mut dir_files);
    }

    Ok(data_sources)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn export_path_cannot_escape_root() {
        let root = Path::new("/tmp/downloads");

        for name in [
            "../evil",
            "../../evil",
            "a/../../evil",
            "./evil",
            "/etc/passwd",
            "a//b",
            "..",
        ] {
            assert!(
                get_export_path(root, name).is_err(),
                "{name:?} should have been rejected"
            );
        }
    }

    #[test]
    fn export_path_allows_ordinary_names() {
        let root = Path::new("/tmp/downloads");

        assert_eq!(
            get_export_path(root, "notes.txt").unwrap(),
            root.join("notes.txt")
        );
        assert_eq!(
            get_export_path(root, "docs/report (1).pdf").unwrap(),
            root.join("docs").join("report (1).pdf")
        );
        assert!(get_export_path(root, ".hidden").is_ok());
        assert!(get_export_path(root, "...").is_ok());
    }

    #[test]
    fn rejects_windows_hostile_components() {
        assert!(validate_path_component("C:").is_err());
        assert!(validate_path_component("file.txt:stream").is_err());
        assert!(validate_path_component("a\\b").is_err());
        assert!(validate_path_component("CON").is_err());
        assert!(validate_path_component("nul.txt").is_err());
        assert!(validate_path_component("LPT9.tar.gz").is_err());
        assert!(validate_path_component("bad\0name").is_err());

        assert!(validate_path_component("CONTENT").is_ok());
        assert!(validate_path_component("COM10").is_ok());
    }
}
