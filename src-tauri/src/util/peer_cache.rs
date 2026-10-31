use dashmap::DashMap;
use iroh::{EndpointAddr, EndpointId, PublicKey};
use iroh_tickets::endpoint::EndpointTicket;
use serde::{Deserialize, Serialize};
use surrealdb::{Surreal, engine::local::Db};
use tauri::{Emitter, Manager};

use crate::{
    db::model::{
        Controller,
        peer::{Peer, PeerController, PeerPatch},
        user::User,
    },
    error::Result,
    events::{PeerDiscoveryEvent, PeerDiscoveryType},
    state::AppState,
};

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all(serialize = "camelCase"))]
pub struct EphemeralPeer {
    pub endpoint_id: PublicKey,
    pub addr: Option<EndpointAddr>,
    pub ticket: Option<EndpointTicket>,
    pub peer: Option<Peer>,
}

pub struct PeerCache {
    peers: DashMap<String, EphemeralPeer>,
    db: Surreal<Db>,
}

impl PeerCache {
    pub fn new(db: Surreal<Db>) -> Self {
        Self {
            peers: DashMap::new(),
            db,
        }
    }

    fn db(&self) -> &Surreal<Db> {
        &self.db
    }

    pub fn get(&self, id: EndpointId) -> Option<EphemeralPeer> {
        self.peers.get(&id.to_string()).map(|p| p.clone())
    }

    pub async fn enrich(&self, id: EndpointId, user: User) -> Result<Option<EphemeralPeer>> {
        let stored_peer = self.get(id);

        let db = self.db();
        let db_peer_opt = PeerController::get_by_endpoint_id(db, id).await?;

        let db_peer: Peer = match db_peer_opt {
            Some(dbp) => {
                let patch = PeerPatch {
                    name: Some(user.name),
                    platform: Some(user.platform),
                    endpoint_id: None,
                    ticket: None,
                    updated_at: None,
                    kind: None,
                    trust_level: None,
                    last_seen: None,
                };
                PeerController::update(db, &dbp.id.to_string(), &patch).await?
            }
            None => {
                // If this does not exist then it shouldn't be stored on cache since we create on db before storing to cache.
                return Ok(None);
            }
        };

        if let Some(mut ephemeral) = stored_peer {
            ephemeral.peer = Some(db_peer);
            self.peers.insert(id.to_string(), ephemeral.clone());

            return Ok(Some(ephemeral));
        }

        Ok(None)
    }

    pub async fn upsert(&self, peer: &EphemeralPeer) -> Result<(EphemeralPeer, bool)> {
        let stored_peer = self.get(peer.endpoint_id);

        match stored_peer {
            Some(eph_peer) => Ok((eph_peer, false)),
            None => {
                // the beningin of the peer clone wars
                let id_str = peer.endpoint_id.to_string();
                self.peers.insert(id_str.clone(), peer.clone());

                let db_peer =
                    PeerController::get_or_create_from_ephemeral(self.db(), peer.clone()).await?;

                let mut new_peer = peer.clone();
                new_peer.peer = Some(db_peer.clone());
                self.peers.insert(id_str, new_peer.clone());

                Ok((new_peer, true))
            }
        }
    }

    pub async fn is_blocked(&self, endpoint_id: EndpointId) -> bool {
        PeerController::is_blocked(self.db(), endpoint_id)
            .await
            .unwrap_or(false)
    }

    pub async fn refresh(&self) -> Result<Vec<EphemeralPeer>> {
        // Endpoint ids are stored as their string form, so the bind has to match.
        let ids: Vec<String> = self
            .peers
            .iter()
            .map(|entry| entry.endpoint_id.to_string())
            .collect();
        if ids.is_empty() {
            return Ok(Vec::new());
        }

        let mut results = self
            .db()
            .query("SELECT * FROM peer WHERE endpoint_id IN $ids")
            .bind(("ids", ids))
            .await?;
        let rows: Vec<Peer> = results.take(0)?;

        let mut changed = Vec::new();
        for row in rows {
            let Some(mut entry) = self.peers.get_mut(&row.endpoint_id.to_string()) else {
                continue;
            };

            if entry
                .peer
                .as_ref()
                .is_some_and(|cached| cached.updated_at == row.updated_at)
            {
                continue;
            }

            entry.peer = Some(row);
            changed.push(entry.value().clone());
        }

        Ok(changed)
    }

    pub fn expire(&self, endpoint_id: EndpointId) {
        self.peers.remove(&endpoint_id.to_string());
    }

    pub fn list(&self) -> Vec<EphemeralPeer> {
        self.peers.iter().map(|r| r.clone()).collect()
    }
}

pub async fn refresh_nearby(app: &tauri::AppHandle) {
    let state = app.state::<AppState>();
    let Ok(changed) = state.peer_cache().refresh().await else {
        return;
    };

    for peer in changed {
        let event = PeerDiscoveryEvent {
            event_type: PeerDiscoveryType::Enriched,
            peer,
            last_seen: None,
        };
        let _ = app.emit("peer_discovery", event);
    }
}
