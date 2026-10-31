pub mod api;
pub mod model;

use surrealdb::{Surreal, engine::local::Db};

use crate::error::Result;

/// Declares every table the app reads from.
///
/// SurrealDB fails a `SELECT` against a table that has never been written to,
/// and every controller reads before it writes on a fresh install —
/// `create_initial_user` starts by looking for a user. Declaring the tables up
/// front is cheaper than teaching each read to tolerate a missing one.
pub(crate) async fn define_tables(db: &Surreal<Db>) -> Result<()> {
    db.query(
        r#"
        DEFINE TABLE IF NOT EXISTS user SCHEMALESS;
        DEFINE TABLE IF NOT EXISTS peer SCHEMALESS;
        DEFINE TABLE IF NOT EXISTS transfer SCHEMALESS;
        DEFINE TABLE IF NOT EXISTS config SCHEMALESS;
        DEFINE TABLE IF NOT EXISTS family SCHEMALESS;
        "#,
    )
    .await?
    .check()?;

    Ok(())
}
