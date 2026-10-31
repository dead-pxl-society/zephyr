use surrealdb::{Surreal, engine::local::Db};
use surrealitos::SurrealId;

use crate::{
    AppState,
    db::model::{
        Controller,
        user::{NewUser, User, UserController, UserPatch},
    },
    error::Result,
};

pub async fn create_user(db: &Surreal<Db>, new_user: &NewUser) -> Result<User> {
    UserController::create(db, new_user).await
}

pub async fn get_single_user(db: &Surreal<Db>) -> Result<Option<User>> {
    UserController::get_one(db).await
}

pub async fn update_user(db: &Surreal<Db>, id: &SurrealId, patch: &UserPatch) -> Result<User> {
    UserController::update(db, &id.to_string(), patch).await
}

#[tauri::command]
pub async fn update_user_cmd(
    id: SurrealId,
    patch: UserPatch,
    state: tauri::State<'_, AppState>,
) -> Result<User> {
    let db = state.db();
    update_user(db, &id, &patch).await
}

#[tauri::command]
pub async fn get_one_user(state: tauri::State<'_, AppState>) -> Result<Option<User>> {
    let db = state.db();
    UserController::get_one(db).await
}
