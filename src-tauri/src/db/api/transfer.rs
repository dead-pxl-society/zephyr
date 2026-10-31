use std::str::FromStr;

use iroh::PublicKey;
use surrealdb::{Surreal, engine::local::Db};
use surrealitos::SurrealId;

use crate::{
    AppState,
    db::{
        api::PaginationParameters,
        model::{
            Controller,
            peer::PeerController,
            transfer::{NewTransfer, Transfer, TransferController, TransferFilters},
        },
    },
    error::Result,
};

// Here we need to check if the peer string is a valid surrealId, if it is we parse it, if it isn't we search for peer thorugh endpoint id
pub async fn create_transfer(
    db: &Surreal<Db>,
    new_transfer: &NewTransfer,
    peer: Option<String>,
) -> Result<Transfer> {
    let mut transfer_data = new_transfer.clone();
    if let Some(id) = peer {
        let surreal_id: Option<SurrealId> = match id.starts_with("peer:") {
            true => Some(id.parse()?),
            false => {
                let key = PublicKey::from_str(&id)?;
                let peer = PeerController::get_by_endpoint_id(db, key).await?;
                match peer {
                    Some(db_peer) => Some(db_peer.id),
                    None => None,
                }
            }
        };

        transfer_data.peer = surreal_id;
    }

    TransferController::create(db, &transfer_data).await
}

#[tauri::command]
pub async fn create_transfer_cmd(
    new_transfer: NewTransfer,
    peer: Option<String>,
    state: tauri::State<'_, AppState>,
) -> Result<Transfer> {
    let db = state.db();
    create_transfer(db, &new_transfer, peer).await
}

#[tauri::command]
pub async fn get_transfers(
    pagination: PaginationParameters<TransferFilters>,
    state: tauri::State<'_, AppState>,
) -> Result<Vec<Transfer>> {
    let db = state.db();
    TransferController::get_many(db, &pagination).await
}

#[tauri::command]
pub async fn get_transfer_count(state: tauri::State<'_, AppState>) -> Result<usize> {
    let db = state.db();
    TransferController::get_count(db).await
}

#[tauri::command]
pub async fn delete_transfer(
    id: SurrealId,
    state: tauri::State<'_, AppState>,
) -> Result<Option<Transfer>> {
    let db = state.db();
    TransferController::delete(db, &id).await
}

#[tauri::command]
pub async fn delete_all_transfers(state: tauri::State<'_, AppState>) -> Result<()> {
    let db = state.db();
    TransferController::delete_all(db).await
}
