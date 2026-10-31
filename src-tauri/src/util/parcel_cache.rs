use dashmap::DashMap;
use iroh_blobs::api::TempTag;

pub struct ParcelCache {
    parcels: DashMap<usize, TempTag>,
}

impl ParcelCache {
    pub fn new() -> Self {
        Self {
            parcels: DashMap::new(),
        }
    }

    pub fn add(&self, id: usize, tag: TempTag) -> Option<TempTag> {
        self.parcels.insert(id, tag)
    }

    pub fn delete(&self, id: usize) {
        let removed_entry = self.parcels.remove(&id);
        if let Some((_k, tag)) = removed_entry {
            drop(tag);
        }
    }

    pub fn delete_all(&self) {
        self.parcels.clear();
    }
}
