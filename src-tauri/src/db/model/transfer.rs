use async_trait::async_trait;
use serde::{Deserialize, Serialize};
use surrealdb::{
    Surreal,
    engine::local::Db,
    method::Query,
    types::{Datetime, SurrealValue},
};
use surrealitos::{Patch, Relation, SurrealId, extract_id};

use crate::{
    db::{
        api::PaginationParameters,
        model::{Controller, peer::Peer},
    },
    error::{Error, Result},
};

#[derive(Clone, Debug, Deserialize, Serialize, SurrealValue)]
#[serde(rename_all = "lowercase")]
#[surreal(untagged, rename_all = "lowercase")]
pub enum TransferType {
    Inbound,
    Outbound,
}

#[derive(Clone, Debug, Deserialize, Serialize, SurrealValue)]
#[serde(rename_all(serialize = "camelCase"))]
pub struct Transfer {
    pub id: SurrealId,
    pub created_at: Datetime,
    pub updated_at: Datetime,
    pub kind: TransferType,
    pub total_files: usize,
    pub size: usize,
    pub hash: Option<String>,
    pub peer: Option<Relation<Peer>>,
    pub files: Option<Vec<String>>,
}

#[derive(Clone, Debug, Deserialize, Serialize, SurrealValue)]
pub struct NewTransfer {
    pub kind: TransferType,
    pub size: usize,
    #[serde(alias = "totalFiles")]
    pub total_files: usize,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub hash: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub files: Option<Vec<String>>,

    pub peer: Option<SurrealId>,

    #[serde(skip_deserializing)]
    pub created_at: Option<Datetime>,
    #[serde(skip_deserializing)]
    pub updated_at: Option<Datetime>,
}

#[derive(Clone, Debug, Deserialize, Serialize, SurrealValue)]
pub struct TransferPatch {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub kind: Option<TransferType>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub size: Option<usize>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub hash: Option<String>,
    #[serde(alias = "totalFiles", skip_serializing_if = "Option::is_none")]
    pub total_files: Option<usize>,

    #[serde(skip_serializing_if = "Option::is_none")]
    pub peer: Option<SurrealId>,

    #[serde(skip_deserializing)]
    pub updated_at: Option<Datetime>,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
#[serde(rename_all = "snake_case")]
pub struct TransferFilters {
    pub kind: Option<TransferType>,
    pub peer: Option<SurrealId>,
}

pub struct TransferController {}

#[async_trait]
impl Controller<Transfer, NewTransfer, TransferPatch> for TransferController {
    async fn get(db: &Surreal<Db>, id: &SurrealId) -> Result<Option<Transfer>> {
        let mut results = db
            .query("SELECT * FROM ONLY $transfer")
            .bind(("transfer", id.clone().0))
            .await?;

        let transfer: Option<Transfer> = results.take(0)?;
        Ok(transfer)
    }

    async fn update(
        db: &Surreal<Db>,
        id: &str,
        transfer_patch: &TransferPatch,
    ) -> Result<Transfer> {
        let transfer_id = extract_id(id, "transfer");
        let mut transfer_data = transfer_patch.clone();

        transfer_data.updated_at = Some(Datetime::default());

        let transfer_opt: Option<Transfer> = db
            .update(("transfer", transfer_id))
            .merge(Patch(transfer_data))
            .await?;
        let transfer = transfer_opt.ok_or(Error::StoreData("transfer".to_string()))?;
        Ok(transfer)
    }

    async fn create(db: &Surreal<Db>, new_transfer: &NewTransfer) -> Result<Transfer> {
        let mut transfer_data = new_transfer.clone();
        transfer_data.created_at = Some(Datetime::default());
        transfer_data.updated_at = Some(Datetime::default());

        let transfer: Option<Transfer> = db
            .create("transfer")
            .content(Patch(transfer_data.clone()))
            .await?;
        transfer.ok_or(Error::StoreData("transfer".to_string()))
    }

    async fn delete(db: &Surreal<Db>, id: &SurrealId) -> Result<Option<Transfer>> {
        db.query("DELETE transfer WHERE id = $id RETURN NONE")
            .bind(("id", id.clone().0))
            .await?;

        Ok(None)
    }
}

impl TransferController {
    pub async fn get_many(
        db: &Surreal<Db>,
        pagination: &PaginationParameters<TransferFilters>,
    ) -> Result<Vec<Transfer>> {
        let condition = filter_conditions(pagination);
        let query_string = format!(
            "SELECT * FROM transfer {} ORDER BY created_at DESC LIMIT $limit START $offset",
            condition
        );

        let mut query = db
            .query(query_string)
            .bind(("limit", pagination.limit))
            .bind(("offset", pagination.offset));
        query = bind_filters(query, pagination);

        let transfers: Vec<Transfer> = query.await?.take(0)?;

        Ok(transfers)
    }

    pub async fn get_count(db: &Surreal<Db>) -> Result<usize> {
        let mut results = db
            .query(
                r#"
                RETURN (
                    SELECT count()
                    FROM transfer
                    GROUP ALL
                )[0].count;
            "#,
            )
            .await?;

        let count: Option<usize> = results.take(0)?;
        Ok(count.unwrap_or(0))
    }

    pub async fn delete_all(db: &Surreal<Db>) -> Result<()> {
        db.query("DELETE transfer RETURN NONE").await?;
        Ok(())
    }
}

fn filter_conditions(pagination: &PaginationParameters<TransferFilters>) -> String {
    let mut conditions = Vec::new();

    if pagination.filters.is_none() {
        return "".to_string();
    }

    let filters = pagination.filters.as_ref().unwrap();

    if filters.peer.is_some() {
        conditions.push("peer = $peer".to_string());
    }

    if filters.kind.is_some() {
        conditions.push("kind = $kind".to_string());
    }

    if conditions.is_empty() {
        "".to_string()
    } else {
        format!("WHERE {}", conditions.join(" AND "))
    }
}

fn bind_filters<'a>(
    mut query: Query<'a, Db>,
    pagination: &PaginationParameters<TransferFilters>,
) -> Query<'a, Db> {
    if let Some(filters) = &pagination.filters {
        if let Some(peer) = &filters.peer {
            query = query.bind(("peer", peer.0.clone()));
        }

        if let Some(kind) = &filters.kind {
            query = query.bind(("kind", kind.clone()));
        }
    }

    query
}
