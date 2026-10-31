use iroh::PublicKey;
use surrealdb::{
    Surreal,
    engine::local::{Db, RocksDb},
};
use surrealitos::SurrealId;
use tauri::Manager;
use tokio::sync::mpsc;

use crate::{
    db::{
        api::{
            config::publish_config,
            user::{create_user, get_single_user, update_user},
        },
        model::{
            config::ConfigController,
            peer::PeerController,
            user::{NewUser, User, UserPatch},
        },
    },
    discovery::identity::handle_identity_protocol,
    error::Result,
    family::{handler::handle_device_messages, runtime::FamilyRuntime},
    net::node::{Node, NodeSenders},
    sharing::handle_share_messages,
    state::AppState,
    transfer::handle_provider_progress,
    util,
};

const STALE_PEER_CLEANUP_INTERVAL: std::time::Duration =
    std::time::Duration::from_secs(60 * 60 * 24);

/// Everything that has to exist before the UI is useful: the database, the
/// local user row, the iroh node and the background handlers. Any error here
/// is fatal and is surfaced to the user by the caller.
pub(crate) async fn initialize(handle: &tauri::AppHandle) -> Result<()> {
    let surreal = setup_surreal(handle).await?;
    handle.manage(AppState::new(surreal.clone()));

    let user = create_initial_user(&surreal).await?;
    let shortcuts = user.shortcuts.clone();

    setup_node(handle, user).await?;

    if let Err(e) = crate::shortcuts::register_all(handle, &shortcuts) {
        eprintln!("[shortcuts] failed to register global shortcuts: {e}");
    }

    tauri::async_runtime::spawn(crate::discovery::mdns::subscribe_to_mdns_events(
        handle.clone(),
    ));
    crate::discovery::mdns::watch_network_changes(handle.clone());

    Ok(())
}

pub(crate) async fn setup_node(handle: &tauri::AppHandle, user: User) -> Result<()> {
    let local_data_dir = handle.path().app_cache_dir()?;
    let (progress_tx, progress_rx) = mpsc::channel(32);
    let (identity_tx, identity_rx) = mpsc::channel(32);
    let (share_tx, share_rx) = mpsc::channel(32);
    let (device_tx, device_rx) = mpsc::channel(32);
    let secret_key =
        util::identity::load_or_create_secret_key(&handle.path().app_data_dir()?).await?;

    let state = handle.state::<AppState>();
    let db = state.db();

    let senders = NodeSenders {
        provide: progress_tx,
        identity: identity_tx,
        share: share_tx,
        device: device_tx,
    };
    let node = Node::setup(db.clone(), local_data_dir, secret_key, &user, senders).await?;
    let endpoint_id = node.router.endpoint().id();

    let family_runtime = FamilyRuntime::new(
        handle.clone(),
        db.clone(),
        node.gossip.clone(),
        node.router.endpoint().clone(),
        node.device.clone(),
        node.memory_lookup.clone(),
        user.name.clone(),
        node.clip.clone(),
    );
    state.set_family_runtime(family_runtime.clone());
    tauri::async_runtime::spawn(family_runtime.clone().startup());

    state.set_node(std::sync::Arc::new(node));

    let app = handle.clone();
    let identity_app = app.clone();
    let share_app = app.clone();
    let device_app = app.clone();
    tauri::async_runtime::spawn(handle_provider_progress(app, progress_rx));
    tauri::async_runtime::spawn(handle_identity_protocol(identity_app, identity_rx));
    tauri::async_runtime::spawn(handle_share_messages(share_app, share_rx));
    tauri::async_runtime::spawn(handle_device_messages(device_app, device_rx));

    if user.endpoint_id != Some(endpoint_id) {
        let user_id = user.id.clone();
        let user_db = db.clone();
        tauri::async_runtime::spawn(set_user_endpoint_id(user_db, user_id, endpoint_id));
    }

    spawn_stale_peer_cleanup(db.clone());
    spawn_clipboard_sync(handle.clone(), family_runtime).await;

    Ok(())
}

async fn spawn_clipboard_sync(handle: tauri::AppHandle, runtime: std::sync::Arc<FamilyRuntime>) {
    match ConfigController::state(handle.state::<AppState>().db()).await {
        Ok(config) => publish_config(&handle, &config),
        Err(e) => eprintln!("[config] failed to load config at startup: {e}"),
    }

    let (write_tx, write_rx) = tokio::sync::mpsc::unbounded_channel();
    handle.state::<AppState>().set_clipboard_writer(write_tx);
    std::thread::spawn(move || crate::clipboard::write_loop(write_rx));

    let (tx, rx) = tokio::sync::watch::channel(None);
    std::thread::spawn(move || crate::clipboard::watch(handle, tx));
    tauri::async_runtime::spawn(crate::clipboard::pump(runtime, rx));
}

fn spawn_stale_peer_cleanup(db: Surreal<Db>) {
    tauri::async_runtime::spawn(async move {
        let mut ticker = tokio::time::interval(STALE_PEER_CLEANUP_INTERVAL);

        loop {
            ticker.tick().await;

            if let Err(e) = PeerController::delete_stale(&db).await {
                eprintln!("Failed to delete stale peers: {e}");
            }
        }
    });
}

pub(crate) async fn setup_surreal(handle: &tauri::AppHandle) -> Result<Surreal<Db>> {
    let mut data_dir = handle.path().app_data_dir()?;
    data_dir.push("rocks/");

    tokio::fs::create_dir_all(&data_dir).await?;

    let db = Surreal::new::<RocksDb>(data_dir).await?;
    db.use_ns("zephyr").use_db("db").await?;
    crate::db::define_tables(&db).await?;

    Ok(db)
}

async fn set_user_endpoint_id(
    db: Surreal<Db>,
    id: SurrealId,
    endpoint_id: PublicKey,
) -> Result<User> {
    let patch = UserPatch {
        endpoint_id: Some(endpoint_id),
        ..Default::default()
    };

    update_user(&db, &id, &patch).await
}

pub(crate) async fn create_initial_user(db: &Surreal<Db>) -> Result<User> {
    let user_opt = get_single_user(db).await?;

    let user = match user_opt {
        Some(u) => u,
        None => {
            let new_user = NewUser {
                endpoint_id: None,
                name: util::device::get_name(),
                platform: util::device::get_platform(),
            };

            create_user(db, &new_user).await?
        }
    };

    Ok(user)
}
