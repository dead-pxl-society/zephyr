use async_trait::async_trait;
use surrealdb::{Surreal, engine::local::Db};
use surrealitos::SurrealId;

pub mod config;
pub mod family;
pub mod peer;
pub mod transfer;
pub mod user;

#[async_trait]
#[allow(dead_code)]
pub trait Controller<T, NewT, PatchT> {
    async fn get(db: &Surreal<Db>, id: &SurrealId) -> crate::error::Result<Option<T>>;
    async fn create(db: &Surreal<Db>, new_entity: &NewT) -> crate::error::Result<T>;
    async fn update(db: &Surreal<Db>, id: &str, patch: &PatchT) -> crate::error::Result<T>;
    async fn delete(db: &Surreal<Db>, id: &SurrealId) -> crate::error::Result<Option<T>>;
}
