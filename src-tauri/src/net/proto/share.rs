use std::sync::Arc;

use dashmap::DashMap;
use iroh::{
    Endpoint, EndpointAddr, EndpointId, PublicKey,
    endpoint::{Connection, ConnectionError, VarInt},
    protocol::{AcceptError, ProtocolHandler},
};
use iroh_blobs::ticket::BlobTicket;
use iroh_tickets::endpoint::EndpointTicket;
use serde::{Deserialize, Serialize};
use surrealdb::{Surreal, engine::local::Db};
use tokio::{
    sync::{mpsc, oneshot},
    time::Duration,
};
use tokio_util::sync::CancellationToken;

use crate::{
    db::model::{
        Controller,
        peer::{NewPeer, Peer, PeerController, PeerKind, TrustLevel},
    },
    error::{Error, Result},
    net::proto::{identity::IdentityProtocol, read_prefixed_bytes, write_prefixed_bytes},
};

pub const SHARE_ALPN: &[u8] = b"zephyr/share/0";

/// How long either side waits for the receiving user to answer a request.
const ANSWER_TIMEOUT: Duration = Duration::from_secs(30);

/// Upper bound on asking a first-time sender for their name before their
/// request is shown; the card falls back to the endpoint id if this lapses.
const STRANGER_LOOKUP_TIMEOUT: Duration = Duration::from_secs(5);

/// Application close codes. Both sides read these off the connection so a
/// peer that goes away mid-request still produces the right outcome instead
/// of a generic failure. `CLOSE_UNKNOWN_PEER` is what a blocked sender sees,
/// so from their side blocking is indistinguishable from being unreachable.
const CLOSE_DONE: u32 = 0;
const CLOSE_UNKNOWN_PEER: u32 = 1;
const CLOSE_CANCELLED: u32 = 2;
const CLOSE_TIMEOUT: u32 = 3;

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all(serialize = "camelCase"))]
pub struct ShareInfo {
    pub ticket: BlobTicket,
    #[serde(alias = "totalFiles")]
    pub total_files: usize,
    pub size: u64,
}

#[derive(Debug, Serialize, Deserialize)]
pub enum ShareWire {
    Request { request_id: usize, info: ShareInfo },
    Accept { request_id: usize },
    Reject { request_id: usize },
    Cancel { request_id: usize },
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all(serialize = "camelCase"))]
pub struct PeerInfo {
    #[serde(alias = "endpointId")]
    pub endpoint_id: EndpointId,
    pub name: Option<String>,
}

pub enum ShareMessage {
    Requested {
        peer: PeerInfo,
        info: ShareInfo,
        request_id: usize,
        responder: oneshot::Sender<bool>,
    },
    Accepted {
        endpoint_id: PublicKey,
        request_id: usize,
    },
    Rejected {
        endpoint_id: PublicKey,
        request_id: usize,
    },
    Cancelled {
        endpoint_id: PublicKey,
        request_id: usize,
    },
    Timeout {
        endpoint_id: PublicKey,
        request_id: usize,
    },
    /// The receiver has never discovered us, so it refused the request before
    /// showing anything to its user.
    Unknown {
        endpoint_id: PublicKey,
        request_id: usize,
    },
    ReceiveTrusted {
        ticket: BlobTicket,
        peer: PeerInfo,
    },
}

#[derive(Debug, Clone)]
pub struct ShareProtocol {
    db: Surreal<Db>,
    sender: mpsc::Sender<ShareMessage>,
    endpoint: Endpoint,
    identity: IdentityProtocol,
    pending: Arc<DashMap<usize, CancellationToken>>,
}

impl ShareWire {
    pub fn to_bytes(&self) -> Vec<u8> {
        postcard::to_stdvec(self).expect("Failed to serialize share wire")
    }

    pub fn from_bytes(bytes: &[u8]) -> Result<Self> {
        let wire: Self = postcard::from_bytes(bytes)?;
        Ok(wire)
    }
}

/// Finds the application close code the remote used, if the error is one.
fn remote_close_code(error: &AcceptError) -> Option<VarInt> {
    let AcceptError::User { source, .. } = error else {
        return None;
    };

    let mut current: Option<&dyn std::error::Error> = Some(source);
    while let Some(e) = current {
        if let Some(ConnectionError::ApplicationClosed(closed)) =
            e.downcast_ref::<ConnectionError>()
        {
            return Some(closed.error_code);
        }
        current = e.source();
    }

    None
}

fn message_for_close(
    error: &AcceptError,
    endpoint_id: PublicKey,
    request_id: usize,
) -> Option<ShareMessage> {
    let code = remote_close_code(error)?;

    if code == VarInt::from_u32(CLOSE_CANCELLED) {
        Some(ShareMessage::Cancelled {
            endpoint_id,
            request_id,
        })
    } else if code == VarInt::from_u32(CLOSE_TIMEOUT) {
        Some(ShareMessage::Timeout {
            endpoint_id,
            request_id,
        })
    } else if code == VarInt::from_u32(CLOSE_UNKNOWN_PEER) {
        Some(ShareMessage::Unknown {
            endpoint_id,
            request_id,
        })
    } else {
        None
    }
}

impl ProtocolHandler for ShareProtocol {
    async fn accept(&self, connection: Connection) -> std::result::Result<(), AcceptError> {
        let node_id = connection.remote_id();

        let peer_opt = PeerController::get_by_endpoint_id(&self.db, node_id)
            .await
            .map_err(AcceptError::from_err)?;

        let peer = match peer_opt {
            Some(peer) if peer.trust_level == TrustLevel::Blocked => {
                connection.close(CLOSE_UNKNOWN_PEER.into(), b"unknown_peer");
                return Err(AcceptError::from_err(Error::UnknownPeer));
            }
            Some(peer) => peer,
            None => self
                .register_stranger(node_id)
                .await
                .map_err(AcceptError::from_err)?,
        };

        let (mut send, mut recv) = connection.accept_bi().await?;

        let bytes = read_prefixed_bytes(&mut recv).await?;
        let wire: ShareWire = postcard::from_bytes(&bytes).map_err(AcceptError::from_err)?;

        let (request_id, info) = match wire {
            ShareWire::Request { request_id, info } => (request_id, info),
            _ => return Ok(()),
        };

        let (tx, rx) = oneshot::channel::<bool>();

        let peer_info = PeerInfo {
            endpoint_id: node_id,
            name: peer.name,
        };

        if peer.trust_level == TrustLevel::Trusted {
            self.sender
                .send(ShareMessage::ReceiveTrusted {
                    ticket: info.ticket,
                    peer: peer_info,
                })
                .await
                .map_err(AcceptError::from_err)?;

            let bytes = ShareWire::Accept { request_id }.to_bytes();
            write_prefixed_bytes(&mut send, &bytes).await?;

            let _ = send.finish();
            connection.closed().await;

            return Ok(());
        }

        self.sender
            .send(ShareMessage::Requested {
                peer: peer_info,
                info,
                request_id,
                responder: tx,
            })
            .await
            .map_err(AcceptError::from_err)?;

        let decision = tokio::select! {
            res = rx => res.ok(),

            message = read_prefixed_bytes(&mut recv) => {
                match message {
                    Err(error) => {
                        if let Some(msg) = message_for_close(&error, node_id, request_id) {
                            let _ = self.sender.send(msg).await;
                        }
                    }
                    Ok(bytes) => {
                        if let Ok(ShareWire::Cancel { .. }) = ShareWire::from_bytes(&bytes) {
                            let _ = self.sender
                                .send(ShareMessage::Cancelled { endpoint_id: node_id, request_id })
                                .await;

                            connection.close(CLOSE_CANCELLED.into(), b"cancelled");
                        }
                    }
                }

                None
            }

            _ = tokio::time::sleep(ANSWER_TIMEOUT) => {
                let _ = self.sender
                    .send(ShareMessage::Timeout { endpoint_id: node_id, request_id })
                    .await;

                connection.close(CLOSE_TIMEOUT.into(), b"timeout");
                None
            }
        };

        if let Some(accepted) = decision {
            let response = if accepted {
                ShareWire::Accept { request_id }
            } else {
                ShareWire::Reject { request_id }
            };

            write_prefixed_bytes(&mut send, &response.to_bytes()).await?;
        }

        let _ = send.finish();
        connection.closed().await;

        Ok(())
    }
}

impl ShareProtocol {
    pub fn new(
        db: Surreal<Db>,
        sender: mpsc::Sender<ShareMessage>,
        endpoint: Endpoint,
        identity: IdentityProtocol,
    ) -> Self {
        Self {
            db,
            sender,
            endpoint,
            identity,
            pending: Arc::new(DashMap::new()),
        }
    }

    /// Anyone can send a request, discovered or not. A sender without a peer
    /// row gets a stranger row so the request card can show a name and so
    /// adding or blocking them afterwards has something to act on.
    async fn register_stranger(&self, remote_id: EndpointId) -> Result<Peer> {
        let addr = match self.endpoint.remote_info(remote_id).await {
            Some(info) => {
                EndpointAddr::from_parts(remote_id, info.into_addrs().map(|a| a.into_addr()))
            }
            None => EndpointAddr::from(remote_id),
        };

        let remote_user =
            tokio::time::timeout(STRANGER_LOOKUP_TIMEOUT, self.identity.get_remote(remote_id))
                .await
                .ok()
                .and_then(|res| res.ok());

        let new_peer = NewPeer {
            endpoint_id: remote_id,
            ticket: EndpointTicket::from(addr),
            name: remote_user.as_ref().map(|u| u.name.clone()),
            platform: remote_user.map(|u| u.platform),
            kind: Some(PeerKind::Stranger),
            trust_level: Some(TrustLevel::Untrusted),
            created_at: None,
            updated_at: None,
            last_seen: None,
        };

        PeerController::create(&self.db, &new_peer).await
    }

    pub async fn share(
        &self,
        info: ShareInfo,
        endpoint: &Endpoint,
        remote_addr: EndpointAddr,
    ) -> Result<usize> {
        let node_id = remote_addr.id;
        let connection = endpoint.connect(remote_addr, SHARE_ALPN).await?;

        let (mut send, mut recv) = connection.open_bi().await?;

        let request_id = connection.stable_id();

        let wire = ShareWire::Request { request_id, info };

        let bytes = postcard::to_stdvec(&wire)?;
        write_prefixed_bytes(&mut send, &bytes).await?;

        let cancel_token = CancellationToken::new();
        self.pending.insert(request_id, cancel_token.clone());

        let sender_clone = self.sender.clone();
        let pending_map = self.pending.clone();

        tokio::spawn(async move {
            tokio::select! {
                response = read_prefixed_bytes(&mut recv) => {
                    match response {
                        Err(error) => {
                            let msg = message_for_close(&error, node_id, request_id)
                                .unwrap_or(ShareMessage::Timeout { endpoint_id: node_id, request_id });
                            let _ = sender_clone.send(msg).await;
                        },
                        Ok(bytes) => {
                            match ShareWire::from_bytes(&bytes) {
                                Ok(ShareWire::Accept { .. }) => {
                                    let _ = sender_clone
                                        .send(ShareMessage::Accepted { endpoint_id: node_id, request_id })
                                        .await;
                                }
                                Ok(ShareWire::Reject { .. }) => {
                                    let _ = sender_clone
                                        .send(ShareMessage::Rejected { endpoint_id: node_id, request_id })
                                        .await;
                                }
                                _ => {
                                    let _ = sender_clone
                                        .send(ShareMessage::Timeout { endpoint_id: node_id, request_id })
                                        .await;
                                }
                            }
                        }
                    }
                }

                _ = cancel_token.cancelled() => {
                    let cancel_wire = ShareWire::Cancel { request_id };
                    let _ = write_prefixed_bytes(&mut send, &cancel_wire.to_bytes()).await;

                    let _ = sender_clone
                        .send(ShareMessage::Cancelled { endpoint_id: node_id, request_id })
                        .await;

                    connection.close(CLOSE_CANCELLED.into(), b"cancelled");
                }

                _ = tokio::time::sleep(ANSWER_TIMEOUT) => {
                    let _ = sender_clone
                        .send(ShareMessage::Timeout { endpoint_id: node_id, request_id })
                        .await;

                    connection.close(CLOSE_TIMEOUT.into(), b"timeout");
                }
            }

            pending_map.remove(&request_id);
            let _ = send.finish();
            connection.close(CLOSE_DONE.into(), b"done");
        });

        Ok(request_id)
    }

    pub fn cancel(&self, request_id: usize) {
        if let Some((_, token)) = self.pending.remove(&request_id) {
            token.cancel();
        }
    }
}
