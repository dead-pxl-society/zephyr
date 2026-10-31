use serde::{Deserialize, Serialize};

pub mod config;
pub mod peer;
pub mod transfer;
pub mod user;

#[derive(Serialize, Deserialize, Debug)]
pub struct PaginationParameters<T = ()> {
    #[serde(default)]
    pub offset: usize,
    #[serde(default = "default_limit")]
    pub limit: usize,
    #[serde(flatten)]
    pub filters: Option<T>,
}

fn default_limit() -> usize {
    50
}

impl<T> Default for PaginationParameters<T> {
    fn default() -> Self {
        Self {
            offset: 0,
            limit: 50,
            filters: None,
        }
    }
}
