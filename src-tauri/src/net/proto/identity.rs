use std::time::Duration;

use iroh::{
    EndpointId,
    endpoint::Connection,
    protocol::{AcceptError, ProtocolHandler},
};
use iroh_util::connection_pool::ConnectionPool;
use tokio::sync::mpsc;

use crate::{
    db::model::user::User,
    error::Result,
    net::proto::{read_prefixed_bytes, write_prefixed_bytes},
};

pub const INFO_ALPN: &[u8] = b"zephyr/info/0";

// A peer running an older build parks after its first exchange and never
// accepts another stream on a reused connection; cap the wait instead of
// hanging until the pool reaps the connection.
const REQUEST_TIMEOUT: Duration = Duration::from_secs(10);

pub enum IdentityMessage {
    RemoteUser { user: User, endpoint_id: EndpointId },
}

#[derive(Debug, Clone)]
pub struct IdentityProtocol {
    user: User,
    sender: mpsc::Sender<IdentityMessage>,
    pub(crate) pool: ConnectionPool,
}

impl ProtocolHandler for IdentityProtocol {
    async fn accept(&self, connection: Connection) -> std::result::Result<(), AcceptError> {
        let node_id = connection.remote_id();

        while let Ok((mut send, mut recv)) = connection.accept_bi().await {
            let remote_bytes = read_prefixed_bytes(&mut recv).await?;
            let remote_user = User::from_bytes(&remote_bytes).map_err(AcceptError::from_err)?;

            let _ = self
                .sender
                .send(IdentityMessage::RemoteUser {
                    user: remote_user,
                    endpoint_id: node_id,
                })
                .await;

            write_prefixed_bytes(&mut send, &self.user.to_bytes()).await?;
            send.finish()?;
        }

        Ok(())
    }
}

impl IdentityProtocol {
    pub fn new(user: User, sender: mpsc::Sender<IdentityMessage>, pool: ConnectionPool) -> Self {
        Self { user, sender, pool }
    }

    async fn request(&self, remote_id: EndpointId) -> Result<User> {
        let connection = self.pool.get_or_connect(remote_id).await?;

        let remote_user = tokio::time::timeout(REQUEST_TIMEOUT, async {
            let (mut send, mut recv) = connection.open_bi().await?;

            write_prefixed_bytes(&mut send, &self.user.to_bytes()).await?;
            send.finish()?;

            let remote_bytes = read_prefixed_bytes(&mut recv).await?;
            User::from_bytes(&remote_bytes)
        })
        .await??;

        Ok(remote_user)
    }

    pub async fn exchange(&self, remote_id: EndpointId) -> Result<User> {
        let remote_user = self.request(remote_id).await?;

        let _ = self
            .sender
            .send(IdentityMessage::RemoteUser {
                user: remote_user.clone(),
                endpoint_id: remote_id,
            })
            .await;

        Ok(remote_user)
    }

    pub async fn get_remote(&self, remote_id: EndpointId) -> Result<User> {
        self.request(remote_id).await
    }
}
