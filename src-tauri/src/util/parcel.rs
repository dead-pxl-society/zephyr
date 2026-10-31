use std::path::PathBuf;
use std::sync::atomic::{AtomicUsize, Ordering};

use serde::{Deserialize, Serialize};

use super::file::FileEntry;

static NEXT_PARCEL_ID: AtomicUsize = AtomicUsize::new(0);

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all(serialize = "camelCase"))]
pub struct Parcel {
    pub id: usize,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub files: Option<Vec<FileEntry>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub size: Option<u64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub ticket: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub hash: Option<String>,
    #[serde(alias = "totalFiles", skip_serializing_if = "Option::is_none")]
    pub total_files: Option<usize>,
}

pub fn next_parcel_id() -> usize {
    NEXT_PARCEL_ID.fetch_add(1, Ordering::Relaxed)
}

pub fn map_files_to_parcel(files: Vec<String>) -> Vec<FileEntry> {
    files
        .iter()
        .map(|f| {
            let path = PathBuf::from(f);
            let mime = get_path_mime(path);

            FileEntry {
                path: f.clone(),
                mime,
            }
        })
        .collect()
}

fn get_path_mime(path: PathBuf) -> String {
    if path.is_dir() {
        return "folder".to_string();
    }
    let infer_result = infer::get_from_path(path);
    if let Ok(kind_opt) = infer_result
        && let Some(kind) = kind_opt
    {
        if kind.extension() == "csv" {
            return "text/csv".to_string();
        }
        return kind.mime_type().to_string();
    }

    "unknown".to_string()
}

impl Parcel {
    pub fn new_with_files(files: Vec<String>) -> Self {
        let id = next_parcel_id();
        let files = map_files_to_parcel(files);
        Self {
            id,
            total_files: Some(files.len()),
            files: Some(files),
            size: None,
            ticket: None,
            hash: None,
        }
    }
}
