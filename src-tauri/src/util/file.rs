use std::path::Path;

use serde::{Deserialize, Serialize};
use xxhash_rust::xxh3::xxh3_128;

#[derive(Clone, Debug, Deserialize, Serialize)]
pub struct FileEntry {
    pub path: String,
    pub mime: String,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct SelectionHash(u128);

impl SelectionHash {
    pub const ZERO: SelectionHash = SelectionHash(0);
}

pub fn calculate_selection_hash<'a, I>(paths: I) -> SelectionHash
where
    I: IntoIterator<Item = &'a Path>,
{
    let mut acc: u128 = 0;

    for path in paths {
        if let Some(s) = path.to_str() {
            acc = acc.wrapping_add(xxh3_128(s.as_bytes()));
        } else {
            acc = acc.wrapping_add(xxh3_128(path.as_os_str().as_encoded_bytes()));
        }
    }

    SelectionHash(acc)
}
