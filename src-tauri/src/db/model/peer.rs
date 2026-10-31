use async_trait::async_trait;
use iroh::PublicKey;
use iroh_tickets::endpoint::EndpointTicket;
use serde::{Deserialize, Serialize};
use surrealdb::{
    Surreal,
    engine::local::Db,
    method::Query,
    types::{Datetime, SurrealValue},
};
use surrealitos::{Patch, SurrealId, extract_id};

use crate::{
    db::{api::PaginationParameters, model::Controller},
    error::{Error, Result},
    util::{device::Platform, peer_cache::EphemeralPeer},
};

#[derive(Clone, Debug, Default, Deserialize, Serialize, PartialEq, SurrealValue)]
#[serde(rename_all = "camelCase")]
#[surreal(untagged, rename_all = "camelCase")]
pub enum PeerKind {
    #[default]
    Stranger,
    Contact,
    Device,
}

#[derive(Clone, Debug, Default, Deserialize, Serialize, PartialEq, SurrealValue)]
#[serde(rename_all = "camelCase")]
#[surreal(untagged, rename_all = "camelCase")]
pub enum TrustLevel {
    #[default]
    Untrusted,
    Trusted,
    Blocked,
}

#[derive(Clone, Debug, Deserialize, Serialize, SurrealValue)]
#[serde(rename_all(serialize = "camelCase"))]
pub struct Peer {
    pub id: SurrealId,
    pub created_at: Datetime,
    pub updated_at: Datetime,

    #[surreal(wrap)]
    pub endpoint_id: PublicKey,
    #[surreal(wrap)]
    pub ticket: EndpointTicket,
    pub name: Option<String>,
    pub platform: Option<Platform>,
    pub last_seen: Option<Datetime>,

    #[serde(default)]
    #[surreal(default)]
    pub kind: PeerKind,
    #[serde(default)]
    #[surreal(default)]
    pub trust_level: TrustLevel,
}

#[derive(Clone, Debug, Deserialize, Serialize, SurrealValue)]
pub struct NewPeer {
    #[surreal(wrap)]
    pub endpoint_id: PublicKey,
    #[surreal(wrap)]
    pub ticket: EndpointTicket,

    #[serde(skip_serializing_if = "Option::is_none")]
    pub name: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub platform: Option<Platform>,

    #[serde(default)]
    pub kind: Option<PeerKind>,
    #[serde(default)]
    pub trust_level: Option<TrustLevel>,

    #[serde(skip_deserializing)]
    pub created_at: Option<Datetime>,
    #[serde(skip_deserializing)]
    pub updated_at: Option<Datetime>,
    #[serde(skip_deserializing)]
    pub last_seen: Option<Datetime>,
}

#[derive(Clone, Debug, Serialize, Deserialize, Default, SurrealValue)]
pub struct PeerPatch {
    #[serde(alias = "endpointId", skip_serializing_if = "Option::is_none")]
    #[surreal(wrap)]
    pub endpoint_id: Option<PublicKey>,
    #[serde(skip_serializing_if = "Option::is_none")]
    #[surreal(wrap)]
    pub ticket: Option<EndpointTicket>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub name: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub platform: Option<Platform>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub kind: Option<PeerKind>,
    #[serde(alias = "trustLevel", skip_serializing_if = "Option::is_none")]
    pub trust_level: Option<TrustLevel>,
    #[serde(alias = "lastSeen", skip_serializing_if = "Option::is_none")]
    pub last_seen: Option<Datetime>,

    #[serde(skip_deserializing)]
    pub updated_at: Option<Datetime>,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
#[serde(rename_all = "snake_case")]
pub struct PeerFilters {
    pub kind: Option<PeerKind>,
    pub trust_level: Option<TrustLevel>,
    pub search: Option<String>,
}

pub struct PeerController;

#[async_trait]
impl Controller<Peer, NewPeer, PeerPatch> for PeerController {
    async fn get(db: &Surreal<Db>, id: &SurrealId) -> Result<Option<Peer>> {
        let mut results = db
            .query("SELECT * FROM ONLY $peer")
            .bind(("peer", id.clone().0))
            .await?;

        let peer: Option<Peer> = results.take(0)?;
        Ok(peer)
    }

    async fn update(db: &Surreal<Db>, id: &str, peer_patch: &PeerPatch) -> Result<Peer> {
        let peer_id = extract_id(id, "peer");
        let mut peer_data = peer_patch.clone();

        peer_data.updated_at = Some(Datetime::default());
        if peer_data.last_seen.is_none() {
            peer_data.last_seen = Some(Datetime::default());
        }

        let peer_opt: Option<Peer> = db.update(("peer", peer_id)).merge(Patch(peer_data)).await?;
        let peer = peer_opt.ok_or(Error::StoreData("peer".to_string()))?;
        Ok(peer)
    }

    async fn create(db: &Surreal<Db>, new_peer: &NewPeer) -> Result<Peer> {
        let mut peer_data = new_peer.clone();
        peer_data.created_at = Some(Datetime::default());
        peer_data.updated_at = Some(Datetime::default());
        peer_data.last_seen = Some(Datetime::default());

        let peer: Option<Peer> = db.create("peer").content(Patch(peer_data)).await?;
        peer.ok_or(Error::StoreData("peer".to_string()))
    }

    async fn delete(db: &Surreal<Db>, id: &SurrealId) -> Result<Option<Peer>> {
        db.query("DELETE peer WHERE id = $id RETURN NONE")
            .bind(("id", id.clone().0))
            .await?;

        Ok(None)
    }
}

impl PeerController {
    // TODO: sometimes Iroh uses only the first ten chars of the endpoint id
    // we should adapt this function to check for either equality or starts_with
    pub async fn get_by_endpoint_id(
        db: &Surreal<Db>,
        endpoint_id: PublicKey,
    ) -> Result<Option<Peer>> {
        let mut results = db
            .query("SELECT * FROM peer WHERE endpoint_id = $endpoint_id")
            .bind(("endpoint_id", endpoint_id.to_string()))
            .await?;

        let peer: Option<Peer> = results.take(0)?;
        Ok(peer)
    }

    pub async fn is_blocked(db: &Surreal<Db>, endpoint_id: PublicKey) -> Result<bool> {
        let peer = Self::get_by_endpoint_id(db, endpoint_id).await?;
        Ok(peer.is_some_and(|p| p.trust_level == TrustLevel::Blocked))
    }

    pub async fn set_blocked(db: &Surreal<Db>, id: &str, blocked: bool) -> Result<Peer> {
        let patch = PeerPatch {
            trust_level: Some(if blocked {
                TrustLevel::Blocked
            } else {
                TrustLevel::Untrusted
            }),
            ..Default::default()
        };

        Self::update(db, id, &patch).await
    }

    pub async fn get_by_kind(db: &Surreal<Db>, kind: PeerKind) -> Result<Vec<Peer>> {
        let mut results = db
            .query("SELECT * FROM peer WHERE kind = $kind")
            .bind(("kind", kind))
            .await?;

        let peers: Vec<Peer> = results.take(0)?;
        Ok(peers)
    }

    pub async fn get_or_create_from_ephemeral(
        db: &Surreal<Db>,
        ephemeral: EphemeralPeer,
    ) -> Result<Peer> {
        let peer_opt = Self::get_by_endpoint_id(db, ephemeral.endpoint_id).await?;

        let db_peer = match peer_opt {
            Some(peer) => peer,
            None => {
                let new_peer = NewPeer {
                    endpoint_id: ephemeral.endpoint_id,
                    ticket: ephemeral.ticket.unwrap(),
                    kind: Some(PeerKind::Stranger),
                    trust_level: Some(TrustLevel::Untrusted),
                    name: None,
                    platform: None,
                    created_at: None,
                    updated_at: None,
                    last_seen: None,
                };

                Self::create(db, &new_peer).await?
            }
        };

        Ok(db_peer)
    }

    pub async fn get_many(
        db: &Surreal<Db>,
        pagination: &PaginationParameters<PeerFilters>,
    ) -> Result<Vec<Peer>> {
        let condition = filter_conditions(pagination);
        let query_string = format!(
            "SELECT * FROM peer {} ORDER BY created_at DESC LIMIT $limit START $offset",
            condition
        );

        let mut query = db
            .query(query_string)
            .bind(("limit", pagination.limit))
            .bind(("offset", pagination.offset));
        query = bind_filters(query, pagination);

        let peers: Vec<Peer> = query.await?.take(0)?;

        Ok(peers)
    }

    pub async fn get_count(
        db: &Surreal<Db>,
        pagination: &PaginationParameters<PeerFilters>,
    ) -> Result<usize> {
        let condition = filter_conditions(pagination);
        let query_string = format!(
            "RETURN (SELECT count() FROM peer {} GROUP ALL)[0].count;",
            condition
        );

        let mut query = db.query(query_string);
        query = bind_filters(query, pagination);

        let count: Option<usize> = query.await?.take(0)?;
        Ok(count.unwrap_or(0))
    }

    pub async fn create_or_update(db: &Surreal<Db>, new_peer: &NewPeer) -> Result<Peer> {
        match Self::get_by_endpoint_id(db, new_peer.endpoint_id).await? {
            Some(existing) => {
                let patch = PeerPatch {
                    endpoint_id: Some(new_peer.endpoint_id),
                    ticket: Some(new_peer.ticket.clone()),
                    name: new_peer.name.clone(),
                    platform: new_peer.platform.clone(),
                    kind: new_peer.kind.clone(),
                    trust_level: new_peer.trust_level.clone(),
                    last_seen: None,
                    updated_at: None,
                };
                Self::update(db, &existing.id.to_string(), &patch).await
            }
            None => Self::create(db, new_peer).await,
        }
    }

    pub async fn delete_strangers(db: &Surreal<Db>) -> Result<()> {
        db.query(
            "DELETE peer WHERE kind NOT IN ['contact', 'device'] AND trust_level != 'blocked'",
        )
        .await?;

        Ok(())
    }

    pub async fn delete_stale(db: &Surreal<Db>) -> Result<()> {
        db.query(
            "DELETE peer WHERE kind NOT IN ['contact', 'device'] AND trust_level != 'blocked' AND last_seen < time::now() - 15d",
        )
        .await?;

        Ok(())
    }
}

fn filter_conditions(pagination: &PaginationParameters<PeerFilters>) -> String {
    let filters = pagination.filters.as_ref();
    let mut conditions = Vec::new();

    match filters.and_then(|f| f.trust_level.as_ref()) {
        Some(_) => conditions.push("trust_level = $trust_level".to_string()),
        None => conditions.push("trust_level != 'blocked'".to_string()),
    }

    if let Some(filters) = filters {
        if filters.kind.is_some() {
            conditions.push("kind = $kind".to_string());
        }

        if search_term(filters).is_some() {
            conditions.push(
                "(name IS NOT NONE AND string::lowercase(name) CONTAINS $search)".to_string(),
            );
        }
    }

    format!("WHERE {}", conditions.join(" AND "))
}

fn bind_filters<'a>(
    mut query: Query<'a, Db>,
    pagination: &PaginationParameters<PeerFilters>,
) -> Query<'a, Db> {
    if let Some(filters) = &pagination.filters {
        if let Some(trust_level) = &filters.trust_level {
            query = query.bind(("trust_level", trust_level.clone()));
        }

        if let Some(kind) = &filters.kind {
            query = query.bind(("kind", kind.clone()));
        }

        if let Some(search) = search_term(filters) {
            query = query.bind(("search", search));
        }
    }

    query
}

fn search_term(filters: &PeerFilters) -> Option<String> {
    let search = filters.search.as_ref()?.trim().to_lowercase();
    (!search.is_empty()).then_some(search)
}
