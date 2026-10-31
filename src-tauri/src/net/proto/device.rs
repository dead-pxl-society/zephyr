use std::sync::{Arc, Mutex as StdMutex};

use iroh::{
    Endpoint, EndpointAddr, PublicKey,
    endpoint::Connection,
    protocol::{AcceptError, ProtocolHandler},
};
use iroh_tickets::endpoint::EndpointTicket;
use iroh_util::connection_pool::ConnectionPool;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use surrealdb::{Surreal, engine::local::Db};
use tokio::{
    sync::{mpsc, oneshot},
    time::Duration,
};
use tokio_util::sync::CancellationToken;

use crate::{
    db::model::{
        config::{ConfigController, ConfigEntry},
        family::{FamilyController, FamilyPatch, FamilyState, PreviousFamily},
        user::{SerializableUser, User},
    },
    error::{Error, Result},
    family::{
        AdoptContext, Evaluation, apply_state, clear_pending_kicks_for, evaluate_roster,
        generate_secret, now_ms, record_previous_family,
        roster::{RosterDoc, RosterMember, SignedRoster},
        wipe_family,
    },
    net::proto::{read_prefixed_bytes, write_prefixed_bytes},
    util::device::Platform,
};

pub const DEVICE_ALPN: &[u8] = b"zephyr/device/0";

/// The target user needs time to read and compare the pairing code.
const PAIRING_ANSWER_TIMEOUT: Duration = Duration::from_secs(60);
/// Initiator waits for the target's answer plus network slack.
const PAIRING_RESPONSE_TIMEOUT: Duration = Duration::from_secs(75);
const WELCOME_TIMEOUT: Duration = Duration::from_secs(30);
const REQUEST_TIMEOUT: Duration = Duration::from_secs(10);

#[derive(Clone, Debug, Serialize, Deserialize)]
pub enum RejectReason {
    Declined,
    Busy,
    CodeMismatch,
    AlreadyInFamily,
    /// The target user never answered within the pairing window.
    Timeout,
}

impl std::fmt::Display for RejectReason {
    /// Stable machine codes: these strings are part of the frontend event
    /// contract, don't rename them.
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str(match self {
            Self::Declined => "declined",
            Self::Busy => "busy",
            Self::CodeMismatch => "code_mismatch",
            Self::AlreadyInFamily => "already_in_family",
            Self::Timeout => "timeout",
        })
    }
}

#[derive(Debug, Serialize, Deserialize)]
pub enum DeviceWire {
    // ---- pairing: one long-lived connection, strict sequence ----
    Invite {
        user: SerializableUser,
        nonce: [u8; 16],
        /// Sender's current roster, so the other side can build a merged
        /// roster when both devices already belong to a family.
        roster: Option<SignedRoster>,
    },
    InviteAccepted {
        user: SerializableUser,
        roster: Option<SignedRoster>,
    },
    InviteRejected {
        reason: RejectReason,
    },
    MergeDecision {
        keep_family_id: [u8; 32],
    },
    FamilyWelcome {
        roster: SignedRoster,
        epoch_secret: [u8; 32],
    },
    WelcomeAck,

    // ---- post-pairing ops: short pooled connections ----
    EpochUpdate {
        roster: SignedRoster,
        epoch_secret: [u8; 32],
    },
    EpochAck,
    SyncRequest {
        family_id: [u8; 32],
        epoch: u64,
    },
    SyncResponse(SyncResult),
    Revoked {
        family_id: [u8; 32],
    },

    ConfigSyncRequest {
        entries: Vec<ConfigEntry>,
    },
    ConfigSyncResponse {
        entries: Vec<ConfigEntry>,
    },
}

#[derive(Debug, Serialize, Deserialize)]
pub enum SyncResult {
    UpToDate,
    Update {
        roster: Box<SignedRoster>,
        epoch_secret: [u8; 32],
    },
    NotMember,
    UnknownFamily,
}

/// What a client-side sync concluded, for callers that need to react.
#[derive(Debug)]
pub enum SyncOutcome {
    UpToDate,
    Adopted,
    Removed,
    Unknown,
}

/// How to answer an incoming SyncRequest. Pure so the matrix is unit-testable.
#[derive(Debug, PartialEq)]
enum SyncVerdict {
    UpToDate,
    /// Requester is behind: send them our current roster + secret.
    SendUpdate,
    /// Requester is not (or no longer) a member, judged from a roster at
    /// least as new as theirs.
    NotMember,
    UnknownFamily,
    /// Requester claims a newer epoch for our own family: WE are the stale
    /// side and cannot rule on their membership — a NotMember here would make
    /// a freshly added member wipe its family state. Answer UpToDate and pull
    /// the newer state ourselves.
    Behind {
        requester_is_member: bool,
    },
}

fn sync_verdict(
    state: &FamilyState,
    previous_families: &[PreviousFamily],
    remote_id: &PublicKey,
    family_id: [u8; 32],
    epoch: u64,
) -> SyncVerdict {
    if state.family_id == family_id {
        let is_member = state.roster.contains(remote_id);
        if epoch > state.epoch {
            return SyncVerdict::Behind {
                requester_is_member: is_member,
            };
        }
        if is_member {
            if epoch == state.epoch {
                SyncVerdict::UpToDate
            } else {
                SyncVerdict::SendUpdate
            }
        } else {
            SyncVerdict::NotMember
        }
    } else {
        // Merge forwarding: a device of a family we absorbed asks about its
        // old family. Epochs are not comparable across family ids.
        let requested_hex = hex::encode(family_id);
        let previous = previous_families
            .iter()
            .find(|p| p.family_id == requested_hex);

        match previous {
            Some(prev) if prev.members.contains(remote_id) => {
                if state.roster.contains(remote_id) {
                    SyncVerdict::SendUpdate
                } else {
                    SyncVerdict::NotMember
                }
            }
            _ => SyncVerdict::UnknownFamily,
        }
    }
}

impl DeviceWire {
    pub fn to_bytes(&self) -> Vec<u8> {
        postcard::to_stdvec(self).expect("Failed to serialize device wire")
    }

    pub fn from_bytes(bytes: &[u8]) -> Result<Self> {
        Ok(postcard::from_bytes(bytes)?)
    }
}

/// Bluetooth-style numeric comparison code. Both sides derive it from the two
/// QUIC-authenticated endpoint ids plus a per-session nonce, so matching codes
/// on both screens mean the user is confirming the same two machines.
pub fn pairing_code(a: &PublicKey, b: &PublicKey, nonce: &[u8; 16]) -> String {
    let (lo, hi) = if a.as_bytes() <= b.as_bytes() {
        (a, b)
    } else {
        (b, a)
    };

    let mut hasher = Sha256::new();
    hasher.update(b"zephyr/pairing/0");
    hasher.update(lo.as_bytes());
    hasher.update(hi.as_bytes());
    hasher.update(nonce);
    let digest = hasher.finalize();

    let num = u32::from_le_bytes(digest[..4].try_into().unwrap()) % 1_000_000;
    format!("{num:06}")
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all(serialize = "camelCase"))]
pub struct DevicePeerInfo {
    pub endpoint_id: PublicKey,
    pub name: Option<String>,
    pub platform: Option<Platform>,
}

pub enum DeviceMessage {
    /// Target side: a peer wants to pair with us; the user must confirm the code.
    InviteReceived {
        session_id: usize,
        peer: DevicePeerInfo,
        code: String,
        responder: oneshot::Sender<bool>,
    },
    /// Initiator side: display the code while waiting for the target.
    ShowCode {
        session_id: usize,
        peer: DevicePeerInfo,
        code: String,
    },
    Paired {
        session_id: usize,
        peer: DevicePeerInfo,
    },
    /// The pairing broke unexpectedly (protocol violation, network error).
    PairingFailed {
        session_id: usize,
        reason: String,
    },
    /// A user said no: the target declined (or never answered), or the
    /// target was busy. Not an error — the reason code is user-presentable.
    PairingRejected {
        session_id: usize,
        reason: RejectReason,
    },
    /// The pairing was cancelled: locally via `cancel_pairing` on the
    /// initiator, or remotely when the other side went away mid-pairing.
    PairingCancelled {
        session_id: usize,
    },
    ConfigChanged,
    /// A new roster was adopted and persisted (pairing, epoch push, or sync).
    /// The handler emits `family_updated` and the runtime rotates the gossip
    /// topic from the freshly persisted state.
    RosterAdopted,
    /// We were removed from the family; local state has been wiped.
    Revoked,
}

#[derive(Debug, Clone)]
pub struct DeviceProtocol {
    db: Surreal<Db>,
    user: User,
    endpoint: Endpoint,
    sender: mpsc::Sender<DeviceMessage>,
    pub(crate) pool: ConnectionPool,
    /// At most one pairing (inbound or outbound) at a time.
    session: Arc<StdMutex<Option<PairingSlot>>>,
}

#[derive(Debug)]
struct PairingSlot {
    session_id: usize,
    cancel: CancellationToken,
}

/// Releases the pairing slot when the pairing flow ends, on every exit path.
struct SessionGuard {
    slot: Arc<StdMutex<Option<PairingSlot>>>,
}

impl Drop for SessionGuard {
    fn drop(&mut self) {
        *self.slot.lock().unwrap() = None;
    }
}

impl DeviceProtocol {
    pub fn new(
        db: Surreal<Db>,
        user: User,
        endpoint: Endpoint,
        sender: mpsc::Sender<DeviceMessage>,
        pool: ConnectionPool,
    ) -> Self {
        Self {
            db,
            user,
            endpoint,
            sender,
            pool,
            session: Arc::new(StdMutex::new(None)),
        }
    }

    fn self_id(&self) -> PublicKey {
        self.endpoint.id()
    }

    fn try_claim_session(&self, session_id: usize) -> Option<(SessionGuard, CancellationToken)> {
        let mut slot = self.session.lock().unwrap();
        if slot.is_some() {
            return None;
        }
        let cancel = CancellationToken::new();
        *slot = Some(PairingSlot {
            session_id,
            cancel: cancel.clone(),
        });
        Some((
            SessionGuard {
                slot: self.session.clone(),
            },
            cancel,
        ))
    }

    /// Abort an in-flight pairing session. No-op if the session already ended.
    pub fn cancel(&self, session_id: usize) {
        let slot = self.session.lock().unwrap();
        if let Some(s) = slot.as_ref()
            && s.session_id == session_id
        {
            s.cancel.cancel();
        }
    }

    fn self_member(&self) -> RosterMember {
        RosterMember {
            endpoint_id: self.self_id(),
            name: self.user.name.clone(),
            platform: self.user.platform.clone(),
            ticket: EndpointTicket::new(self.endpoint.addr()),
        }
    }

    /// Ticket for a peer we are currently connected to, carrying every address
    /// the endpoint has learned for it so roster members can be dialed later
    /// without relying on discovery alone.
    async fn ticket_for(&self, remote_id: PublicKey) -> EndpointTicket {
        let addr = match self.endpoint.remote_info(remote_id).await {
            Some(info) => {
                EndpointAddr::from_parts(remote_id, info.into_addrs().map(|a| a.into_addr()))
            }
            None => EndpointAddr::from(remote_id),
        };

        EndpointTicket::from(addr)
    }

    fn serializable_user(&self) -> SerializableUser {
        SerializableUser {
            id: self.user.id.to_string(),
            endpoint_id: Some(self.self_id()),
            name: self.user.name.clone(),
            platform: self.user.platform.clone(),
        }
    }

    async fn current_state(&self) -> Result<Option<FamilyState>> {
        match FamilyController::get_one(&self.db).await? {
            Some(row) => Ok(Some(row.state()?)),
            None => Ok(None),
        }
    }

    async fn fail(&self, session_id: usize, reason: impl Into<String>) {
        let _ = self
            .sender
            .send(DeviceMessage::PairingFailed {
                session_id,
                reason: reason.into(),
            })
            .await;
    }

    /// Build the state that adds `new_member` to our family (creating the
    /// family if we have none), signed by us. When merging, `absorbed` is the
    /// other side's roster whose members all join ours.
    fn build_granted_state(
        &self,
        current: Option<&FamilyState>,
        new_member: RosterMember,
        absorbed: Option<&SignedRoster>,
    ) -> Result<FamilyState> {
        let (family_id, epoch, mut members) = match current {
            Some(state) => {
                let mut members = state.roster.doc.members.clone();
                members.retain(|m| m.endpoint_id != new_member.endpoint_id);
                (state.family_id, state.epoch + 1, members)
            }
            None => (generate_secret(), 1, vec![self.self_member()]),
        };
        members.push(new_member);

        if let Some(absorbed) = absorbed {
            for member in &absorbed.doc.members {
                if !members.iter().any(|m| m.endpoint_id == member.endpoint_id) {
                    members.push(member.clone());
                }
            }
        }

        let doc = RosterDoc {
            version: 0,
            family_id,
            epoch,
            members,
            author: self.self_id(),
            issued_at_ms: now_ms(),
        };
        let roster = SignedRoster::sign(doc, self.endpoint.secret_key())?;

        Ok(FamilyState {
            family_id,
            epoch,
            epoch_secret: generate_secret(),
            roster,
        })
    }

    /// Persist a state we authored, notify the runtime, and push the new epoch
    /// to every other pre-existing member (best effort; failures stay queued).
    async fn adopt_granted_state(&self, state: FamilyState, exclude: PublicKey) -> Result<()> {
        apply_state(&self.db, &state, self.self_id()).await?;
        // We authored this roster: anyone in it is deliberately a member, so a
        // stale pending kick for them must not fire from the maintenance loop.
        clear_pending_kicks_for(&self.db, &state.roster).await?;

        let others: Vec<PublicKey> = state
            .roster
            .member_ids()
            .into_iter()
            .filter(|id| *id != self.self_id() && *id != exclude)
            .collect();

        if !others.is_empty()
            && let Some(row) = FamilyController::get_one(&self.db).await?
        {
            let patch = FamilyPatch {
                pending_epoch_pushes: Some(others.clone()),
                ..Default::default()
            };
            FamilyController::patch(&self.db, &row.id, &patch).await?;

            for member in others {
                let proto = self.clone();
                let push_state = state.clone();
                tokio::spawn(async move {
                    let _ = proto.push_epoch(member, &push_state).await;
                });
            }
        }

        let _ = self.sender.send(DeviceMessage::RosterAdopted).await;

        Ok(())
    }

    /// Adopt a roster someone else authored. Returns false when the roster
    /// removes us (state is wiped and Revoked is emitted instead).
    async fn adopt_remote_state(&self, state: FamilyState) -> Result<bool> {
        if !state.roster.contains(&self.self_id()) {
            eprintln!("[family] adopted roster removes us; wiping family state");
            wipe_family(&self.db).await?;
            let _ = self.sender.send(DeviceMessage::Revoked).await;
            return Ok(false);
        }

        let previous = self.current_state().await?;
        apply_state(&self.db, &state, self.self_id()).await?;

        // A strictly newer roster (or a family switch) containing someone we
        // were still trying to kick means the re-add is authoritative; only an
        // equal-epoch adoption can be the race `settle_pending_kicks` guards.
        let authoritative = previous
            .as_ref()
            .map(|p| state.family_id != p.family_id || state.epoch > p.epoch)
            .unwrap_or(true);
        if authoritative {
            clear_pending_kicks_for(&self.db, &state.roster).await?;
        }

        // Family switch (merge): remember the old family for forwarding and
        // propagate the new one to our old members.
        if let Some(old) = previous
            && old.family_id != state.family_id
        {
            record_previous_family(&self.db, &old, self.self_id()).await?;

            for member in old.roster.member_ids() {
                if member == self.self_id() {
                    continue;
                }
                let proto = self.clone();
                let push_state = state.clone();
                tokio::spawn(async move {
                    let _ = proto.push_epoch(member, &push_state).await;
                });
            }
        }

        let _ = self.sender.send(DeviceMessage::RosterAdopted).await;

        Ok(true)
    }

    /// Start pairing with a peer. Returns the session id immediately; the
    /// pairing continues in a background task and reports through events.
    pub async fn invite(&self, addr: EndpointAddr) -> Result<usize> {
        let remote_id = addr.id;
        let connection = self.endpoint.connect(addr.clone(), DEVICE_ALPN).await?;
        let session_id = connection.stable_id();

        let Some((guard, cancel)) = self.try_claim_session(session_id) else {
            connection.close(1u32.into(), b"busy");
            return Err(Error::PairingInProgress);
        };

        let proto = self.clone();
        tokio::spawn(async move {
            let _guard = guard;
            tokio::select! {
                res = proto.run_initiator(connection.clone(), remote_id, addr, session_id) => {
                    match res {
                        Ok(()) => {}
                        Err(Error::PairingRejected(reason)) => {
                            let _ = proto
                                .sender
                                .send(DeviceMessage::PairingRejected { session_id, reason })
                                .await;
                        }
                        Err(e) => proto.fail(session_id, e.to_string()).await,
                    }
                }
                _ = cancel.cancelled() => {
                    connection.close(2u32.into(), b"cancelled");
                    let _ = proto
                        .sender
                        .send(DeviceMessage::PairingCancelled { session_id })
                        .await;
                }
            }
        });

        Ok(session_id)
    }

    async fn run_initiator(
        &self,
        connection: Connection,
        remote_id: PublicKey,
        remote_addr: EndpointAddr,
        session_id: usize,
    ) -> Result<()> {
        let (mut send, mut recv) = connection.open_bi().await.map_err(Error::from)?;

        let nonce: [u8; 16] = rand::random();
        let our_state = self.current_state().await?;

        let invite = DeviceWire::Invite {
            user: self.serializable_user(),
            nonce,
            roster: our_state.as_ref().map(|s| s.roster.clone()),
        };
        write_prefixed_bytes(&mut send, &invite.to_bytes()).await?;

        let code = pairing_code(&self.self_id(), &remote_id, &nonce);
        let peer_info = DevicePeerInfo {
            endpoint_id: remote_id,
            name: None,
            platform: None,
        };
        let _ = self
            .sender
            .send(DeviceMessage::ShowCode {
                session_id,
                peer: peer_info,
                code: code.clone(),
            })
            .await;

        let response = read_wire(&mut recv, PAIRING_RESPONSE_TIMEOUT).await?;
        let (remote_user, their_roster) = match response {
            DeviceWire::InviteAccepted { user, roster } => (user, roster),
            DeviceWire::InviteRejected { reason } => {
                return Err(Error::PairingRejected(reason));
            }
            _ => return Err(Error::DeviceProtocol("expected invite response".into())),
        };

        let peer_info = DevicePeerInfo {
            endpoint_id: remote_id,
            name: Some(remote_user.name.clone()),
            platform: Some(remote_user.platform.clone()),
        };

        match (&our_state, &their_roster) {
            // We grant: either a brand new family or adding them to ours.
            (_, None) => {
                let new_member = RosterMember {
                    endpoint_id: remote_id,
                    name: remote_user.name.clone(),
                    platform: remote_user.platform.clone(),
                    ticket: EndpointTicket::from(remote_addr),
                };
                let state = self.build_granted_state(our_state.as_ref(), new_member, None)?;

                let welcome = DeviceWire::FamilyWelcome {
                    roster: state.roster.clone(),
                    epoch_secret: state.epoch_secret,
                };
                // Persist before sending: worst case (ack lost) is a ghost
                // member that can be kicked, never a stranded solo family.
                self.adopt_granted_state(state, remote_id).await?;
                write_prefixed_bytes(&mut send, &welcome.to_bytes()).await?;

                match read_wire(&mut recv, WELCOME_TIMEOUT).await? {
                    DeviceWire::WelcomeAck => {}
                    _ => return Err(Error::DeviceProtocol("expected welcome ack".into())),
                }
            }
            // They have a family and we don't: join theirs.
            (None, Some(theirs)) => {
                let decision = DeviceWire::MergeDecision {
                    keep_family_id: theirs.doc.family_id,
                };
                write_prefixed_bytes(&mut send, &decision.to_bytes()).await?;

                let welcome = read_wire(&mut recv, WELCOME_TIMEOUT).await?;
                let DeviceWire::FamilyWelcome {
                    roster,
                    epoch_secret,
                } = welcome
                else {
                    return Err(Error::DeviceProtocol("expected family welcome".into()));
                };

                self.accept_welcome(roster, epoch_secret, remote_id).await?;
                write_prefixed_bytes(&mut send, &DeviceWire::WelcomeAck.to_bytes()).await?;
            }
            // Both sides already have a family: keep the bigger one so fewer
            // devices have to switch identity and re-sync (ties keep ours).
            (Some(ours), Some(theirs)) => {
                let keep = if theirs.doc.members.len() > ours.roster.doc.members.len() {
                    theirs.doc.family_id
                } else {
                    ours.family_id
                };

                let decision = DeviceWire::MergeDecision {
                    keep_family_id: keep,
                };
                write_prefixed_bytes(&mut send, &decision.to_bytes()).await?;

                if keep == ours.family_id {
                    // We keep our identity and absorb their whole family.
                    let new_member = RosterMember {
                        endpoint_id: remote_id,
                        name: remote_user.name.clone(),
                        platform: remote_user.platform.clone(),
                        ticket: EndpointTicket::from(remote_addr),
                    };
                    let state = self.build_granted_state(Some(ours), new_member, Some(theirs))?;

                    let welcome = DeviceWire::FamilyWelcome {
                        roster: state.roster.clone(),
                        epoch_secret: state.epoch_secret,
                    };
                    self.adopt_granted_state(state, remote_id).await?;
                    write_prefixed_bytes(&mut send, &welcome.to_bytes()).await?;

                    match read_wire(&mut recv, WELCOME_TIMEOUT).await? {
                        DeviceWire::WelcomeAck => {}
                        _ => return Err(Error::DeviceProtocol("expected welcome ack".into())),
                    }
                } else {
                    // Their family survives; they grant the merged roster.
                    let welcome = read_wire(&mut recv, WELCOME_TIMEOUT).await?;
                    let DeviceWire::FamilyWelcome {
                        roster,
                        epoch_secret,
                    } = welcome
                    else {
                        return Err(Error::DeviceProtocol("expected family welcome".into()));
                    };

                    self.accept_welcome(roster, epoch_secret, remote_id).await?;
                    write_prefixed_bytes(&mut send, &DeviceWire::WelcomeAck.to_bytes()).await?;
                }
            }
        }

        let _ = self
            .sender
            .send(DeviceMessage::Paired {
                session_id,
                peer: peer_info,
            })
            .await;

        send.finish().map_err(Error::from)?;
        connection.close(0u32.into(), b"done");

        Ok(())
    }

    /// Validate and adopt a FamilyWelcome received during pairing.
    async fn accept_welcome(
        &self,
        roster: SignedRoster,
        epoch_secret: [u8; 32],
        confirmed_peer: PublicKey,
    ) -> Result<()> {
        let current = self.current_state().await?;
        let ctx = AdoptContext::Pairing { confirmed_peer };

        match evaluate_roster(current.as_ref(), &roster, &ctx) {
            Evaluation::Adopt | Evaluation::AlreadyCurrent => {}
            other => {
                return Err(Error::DeviceProtocol(format!(
                    "welcome roster not acceptable: {other:?}"
                )));
            }
        }

        if !roster.contains(&self.self_id()) {
            return Err(Error::DeviceProtocol("welcome roster excludes us".into()));
        }

        let state = FamilyState {
            family_id: roster.doc.family_id,
            epoch: roster.doc.epoch,
            epoch_secret,
            roster,
        };
        self.adopt_remote_state(state).await?;

        Ok(())
    }

    /// Push a new epoch directly to a member. Ack means delivered.
    pub async fn push_epoch(&self, remote: PublicKey, state: &FamilyState) -> Result<()> {
        let connection = self.pool.get_or_connect(remote).await?;

        tokio::time::timeout(REQUEST_TIMEOUT, async {
            let (mut send, mut recv) = connection.open_bi().await.map_err(Error::from)?;

            let update = DeviceWire::EpochUpdate {
                roster: state.roster.clone(),
                epoch_secret: state.epoch_secret,
            };
            write_prefixed_bytes(&mut send, &update.to_bytes()).await?;
            send.finish().map_err(Error::from)?;

            match read_wire_plain(&mut recv).await? {
                DeviceWire::EpochAck => Ok(()),
                _ => Err(Error::DeviceProtocol("expected epoch ack".into())),
            }
        })
        .await??;

        // Delivered: clear this member from the retry queue.
        if let Some(row) = FamilyController::get_one(&self.db).await? {
            let mut pending = row.pending_epoch_pushes.clone();
            let before = pending.len();
            pending.retain(|id| *id != remote);
            if pending.len() != before {
                let patch = FamilyPatch {
                    pending_epoch_pushes: Some(pending),
                    ..Default::default()
                };
                FamilyController::patch(&self.db, &row.id, &patch).await?;
            }
        }

        Ok(())
    }

    /// Anti-entropy sync with a member: ask whether our epoch is current and
    /// adopt whatever newer state comes back.
    pub async fn sync_with(&self, remote: PublicKey) -> Result<SyncOutcome> {
        let Some(current) = self.current_state().await? else {
            return Err(Error::NoFamily);
        };

        let connection = self.pool.get_or_connect(remote).await?;

        let response = tokio::time::timeout(REQUEST_TIMEOUT, async {
            let (mut send, mut recv) = connection.open_bi().await.map_err(Error::from)?;

            let request = DeviceWire::SyncRequest {
                family_id: current.family_id,
                epoch: current.epoch,
            };
            write_prefixed_bytes(&mut send, &request.to_bytes()).await?;
            send.finish().map_err(Error::from)?;

            match read_wire_plain(&mut recv).await? {
                DeviceWire::SyncResponse(result) => Ok(result),
                _ => Err(Error::DeviceProtocol("expected sync response".into())),
            }
        })
        .await??;

        match response {
            SyncResult::UpToDate => Ok(SyncOutcome::UpToDate),
            SyncResult::Update {
                roster,
                epoch_secret,
            } => {
                let ctx = AdoptContext::Direct { from: remote };
                match evaluate_roster(Some(&current), &roster, &ctx) {
                    Evaluation::Adopt => {
                        let state = FamilyState {
                            family_id: roster.doc.family_id,
                            epoch: roster.doc.epoch,
                            epoch_secret,
                            roster: *roster,
                        };
                        if self.adopt_remote_state(state).await? {
                            Ok(SyncOutcome::Adopted)
                        } else {
                            Ok(SyncOutcome::Removed)
                        }
                    }
                    Evaluation::AlreadyCurrent | Evaluation::Stale => Ok(SyncOutcome::UpToDate),
                    Evaluation::Unauthorized => {
                        Err(Error::DeviceProtocol("unauthorized sync update".into()))
                    }
                }
            }
            SyncResult::NotMember => {
                // Only a member of our last-known roster can tell us we were
                // kicked; a stranger saying so is ignored.
                if current.roster.contains(&remote) {
                    wipe_family(&self.db).await?;
                    let _ = self.sender.send(DeviceMessage::Revoked).await;
                    Ok(SyncOutcome::Removed)
                } else {
                    Ok(SyncOutcome::Unknown)
                }
            }
            SyncResult::UnknownFamily => Ok(SyncOutcome::Unknown),
        }
    }

    pub async fn sync_config_with(&self, remote: PublicKey) -> Result<()> {
        let local = ConfigController::state(&self.db).await?;

        let connection = self.pool.get_or_connect(remote).await?;

        let entries = tokio::time::timeout(REQUEST_TIMEOUT, async {
            let (mut send, mut recv) = connection.open_bi().await.map_err(Error::from)?;

            let request = DeviceWire::ConfigSyncRequest {
                entries: local.entries,
            };
            write_prefixed_bytes(&mut send, &request.to_bytes()).await?;
            send.finish().map_err(Error::from)?;

            match read_wire_plain(&mut recv).await? {
                DeviceWire::ConfigSyncResponse { entries } => Ok(entries),
                _ => Err(Error::DeviceProtocol(
                    "expected config sync response".into(),
                )),
            }
        })
        .await??;

        self.merge_config(&entries).await
    }

    async fn merge_config(&self, incoming: &[ConfigEntry]) -> Result<()> {
        let mut config = ConfigController::state(&self.db).await?;

        if config.merge(incoming).is_empty() {
            return Ok(());
        }

        ConfigController::set_state(&self.db, &config).await?;
        let _ = self.sender.send(DeviceMessage::ConfigChanged).await;

        Ok(())
    }

    async fn accept_config_sync(
        &self,
        remote_id: PublicKey,
        send: &mut iroh::endpoint::SendStream,
        entries: Vec<ConfigEntry>,
    ) -> Result<()> {
        let Some(state) = self.current_state().await? else {
            return Err(Error::NoFamily);
        };

        if !state.roster.contains(&remote_id) {
            return Err(Error::NotAFamilyMember);
        }

        let local = ConfigController::state(&self.db).await?;
        let response = DeviceWire::ConfigSyncResponse {
            entries: local.entries,
        };
        write_prefixed_bytes(send, &response.to_bytes()).await?;

        self.merge_config(&entries).await
    }

    /// We learned a newer epoch exists but can't adopt it from the device
    /// that told us (not in our roster): sync with the members we do trust
    /// until one answers conclusively.
    fn spawn_catch_up(&self, exclude: PublicKey) {
        let proto = self.clone();
        tokio::spawn(async move {
            let Ok(Some(state)) = proto.current_state().await else {
                return;
            };
            let self_id = proto.self_id();
            for member in state.roster.member_ids() {
                if member == self_id || member == exclude {
                    continue;
                }
                match proto.sync_with(member).await {
                    Ok(SyncOutcome::Unknown) | Err(_) => continue,
                    Ok(_) => break,
                }
            }
        });
    }

    /// Courtesy notification to a kicked device. Best effort.
    pub async fn revoke(&self, remote: PublicKey, family_id: [u8; 32]) -> Result<()> {
        let connection = self.pool.get_or_connect(remote).await?;

        tokio::time::timeout(REQUEST_TIMEOUT, async {
            let (mut send, _recv) = connection.open_bi().await.map_err(Error::from)?;
            let wire = DeviceWire::Revoked { family_id };
            write_prefixed_bytes(&mut send, &wire.to_bytes()).await?;
            send.finish().map_err(Error::from)?;
            Ok::<(), Error>(())
        })
        .await??;

        Ok(())
    }

    // ------------------------------------------------------------ accept side

    async fn accept_invite(
        &self,
        connection: &Connection,
        send: &mut iroh::endpoint::SendStream,
        recv: &mut iroh::endpoint::RecvStream,
        remote_user: SerializableUser,
        nonce: [u8; 16],
        their_roster: Option<SignedRoster>,
    ) -> Result<()> {
        let remote_id = connection.remote_id();
        let session_id = connection.stable_id();

        let Some((guard, _cancel)) = self.try_claim_session(session_id) else {
            let reject = DeviceWire::InviteRejected {
                reason: RejectReason::Busy,
            };
            write_prefixed_bytes(&mut *send, &reject.to_bytes()).await?;
            return Ok(());
        };
        let _guard = guard;

        let code = pairing_code(&self.self_id(), &remote_id, &nonce);
        let peer_info = DevicePeerInfo {
            endpoint_id: remote_id,
            name: Some(remote_user.name.clone()),
            platform: Some(remote_user.platform.clone()),
        };

        let (tx, rx) = oneshot::channel();
        let _ = self
            .sender
            .send(DeviceMessage::InviteReceived {
                session_id,
                peer: peer_info.clone(),
                code,
                responder: tx,
            })
            .await;

        let rejection = tokio::select! {
            res = rx => match res.unwrap_or(false) {
                true => None,
                false => Some(RejectReason::Declined),
            },
            // The initiator cancelled or died while we waited for the user:
            // tear down our dialog instead of leaving it up until timeout.
            _ = connection.closed() => {
                let _ = self
                    .sender
                    .send(DeviceMessage::PairingCancelled { session_id })
                    .await;
                return Ok(());
            }
            _ = tokio::time::sleep(PAIRING_ANSWER_TIMEOUT) => Some(RejectReason::Timeout),
        };

        if let Some(reason) = rejection {
            let reject = DeviceWire::InviteRejected {
                reason: reason.clone(),
            };
            write_prefixed_bytes(&mut *send, &reject.to_bytes()).await?;
            let _ = self
                .sender
                .send(DeviceMessage::PairingRejected { session_id, reason })
                .await;
            return Ok(());
        }

        let our_state = self.current_state().await?;
        let accept = DeviceWire::InviteAccepted {
            user: self.serializable_user(),
            roster: our_state.as_ref().map(|s| s.roster.clone()),
        };
        write_prefixed_bytes(&mut *send, &accept.to_bytes()).await?;

        // The initiator now confirms its code, then drives the negotiation.
        let next = read_wire(recv, PAIRING_RESPONSE_TIMEOUT).await?;
        match next {
            DeviceWire::FamilyWelcome {
                roster,
                epoch_secret,
            } => {
                self.accept_welcome(roster, epoch_secret, remote_id).await?;
                write_prefixed_bytes(&mut *send, &DeviceWire::WelcomeAck.to_bytes()).await?;
            }
            DeviceWire::MergeDecision { keep_family_id } => {
                let Some(state) = our_state else {
                    return Err(Error::DeviceProtocol(
                        "merge decision but we have no family".into(),
                    ));
                };

                if state.family_id == keep_family_id {
                    // We are the granter: our family survives; the initiator
                    // (and its whole family, if merging) joins us.
                    let new_member = RosterMember {
                        endpoint_id: remote_id,
                        name: remote_user.name.clone(),
                        platform: remote_user.platform.clone(),
                        ticket: self.ticket_for(remote_id).await,
                    };
                    let granted =
                        self.build_granted_state(Some(&state), new_member, their_roster.as_ref())?;

                    let welcome = DeviceWire::FamilyWelcome {
                        roster: granted.roster.clone(),
                        epoch_secret: granted.epoch_secret,
                    };
                    self.adopt_granted_state(granted, remote_id).await?;
                    write_prefixed_bytes(&mut *send, &welcome.to_bytes()).await?;

                    match read_wire(recv, WELCOME_TIMEOUT).await? {
                        DeviceWire::WelcomeAck => {}
                        _ => return Err(Error::DeviceProtocol("expected welcome ack".into())),
                    }
                } else if their_roster
                    .as_ref()
                    .is_some_and(|r| r.doc.family_id == keep_family_id)
                {
                    // Their family survives: the initiator grants the merged
                    // roster; we adopt the switch and forward to our members.
                    let welcome = read_wire(recv, WELCOME_TIMEOUT).await?;
                    let DeviceWire::FamilyWelcome {
                        roster,
                        epoch_secret,
                    } = welcome
                    else {
                        return Err(Error::DeviceProtocol("expected family welcome".into()));
                    };

                    self.accept_welcome(roster, epoch_secret, remote_id).await?;
                    write_prefixed_bytes(&mut *send, &DeviceWire::WelcomeAck.to_bytes()).await?;
                } else {
                    return Err(Error::DeviceProtocol(
                        "merge decision does not match either family".into(),
                    ));
                }
            }
            DeviceWire::InviteRejected { reason } => {
                let _ = self
                    .sender
                    .send(DeviceMessage::PairingRejected { session_id, reason })
                    .await;
                return Ok(());
            }
            _ => {
                return Err(Error::DeviceProtocol(
                    "unexpected frame during pairing".into(),
                ));
            }
        }

        let _ = self
            .sender
            .send(DeviceMessage::Paired {
                session_id,
                peer: peer_info,
            })
            .await;

        Ok(())
    }

    async fn accept_sync(
        &self,
        remote_id: PublicKey,
        send: &mut iroh::endpoint::SendStream,
        family_id: [u8; 32],
        epoch: u64,
    ) -> Result<()> {
        let row = FamilyController::get_one(&self.db).await?;

        let result = match &row {
            None => SyncResult::UnknownFamily,
            Some(row) => {
                let state = row.state()?;
                match sync_verdict(&state, &row.previous_families, &remote_id, family_id, epoch) {
                    SyncVerdict::UpToDate => SyncResult::UpToDate,
                    SyncVerdict::SendUpdate => SyncResult::Update {
                        roster: Box::new(state.roster.clone()),
                        epoch_secret: state.epoch_secret,
                    },
                    SyncVerdict::NotMember => SyncResult::NotMember,
                    SyncVerdict::UnknownFamily => SyncResult::UnknownFamily,
                    SyncVerdict::Behind {
                        requester_is_member,
                    } => {
                        eprintln!(
                            "[family] sync request from {remote_id} claims newer epoch {epoch} (ours {}); catching up",
                            state.epoch
                        );
                        if requester_is_member {
                            // They're in our roster, so we can adopt directly
                            // from them.
                            let proto = self.clone();
                            tokio::spawn(async move {
                                let _ = proto.sync_with(remote_id).await;
                            });
                        } else {
                            // A member we haven't heard of yet (e.g. freshly
                            // added): a roster from them would be unauthorized
                            // for us, so pull from the members we do trust.
                            self.spawn_catch_up(remote_id);
                        }
                        SyncResult::UpToDate
                    }
                }
            }
        };

        let label = match &result {
            SyncResult::UpToDate => "up-to-date",
            SyncResult::Update { .. } => "update",
            SyncResult::NotMember => "not-member",
            SyncResult::UnknownFamily => "unknown-family",
        };
        eprintln!("[family] sync request from {remote_id} (their epoch {epoch}) -> {label}");

        let response = DeviceWire::SyncResponse(result);
        write_prefixed_bytes(&mut *send, &response.to_bytes()).await?;

        Ok(())
    }

    async fn accept_epoch_update(
        &self,
        remote_id: PublicKey,
        send: &mut iroh::endpoint::SendStream,
        roster: SignedRoster,
        epoch_secret: [u8; 32],
    ) -> Result<()> {
        let current = self.current_state().await?;
        let ctx = AdoptContext::Direct { from: remote_id };

        match evaluate_roster(current.as_ref(), &roster, &ctx) {
            Evaluation::Adopt => {
                let state = FamilyState {
                    family_id: roster.doc.family_id,
                    epoch: roster.doc.epoch,
                    epoch_secret,
                    roster,
                };
                self.adopt_remote_state(state).await?;
                write_prefixed_bytes(&mut *send, &DeviceWire::EpochAck.to_bytes()).await?;
            }
            // Idempotent: acking stale/duplicate pushes stops pointless retries.
            Evaluation::AlreadyCurrent | Evaluation::Stale => {
                write_prefixed_bytes(&mut *send, &DeviceWire::EpochAck.to_bytes()).await?;
            }
            Evaluation::Unauthorized => {
                return Err(Error::DeviceProtocol("unauthorized epoch update".into()));
            }
        }

        Ok(())
    }

    async fn accept_revoked(&self, remote_id: PublicKey, family_id: [u8; 32]) -> Result<()> {
        let Some(current) = self.current_state().await? else {
            eprintln!("[family] revoke notice from {remote_id} ignored: no family");
            return Ok(());
        };

        // Only a hint: verify with a direct sync against the sender, and only
        // if the claim is about our family from a device we currently trust.
        if current.family_id == family_id && current.roster.contains(&remote_id) {
            eprintln!("[family] revoke notice from {remote_id}; verifying via sync");
            let proto = self.clone();
            tokio::spawn(async move {
                if let Err(e) = proto.sync_with(remote_id).await {
                    eprintln!("[family] revoke verification sync with {remote_id} failed: {e}");
                }
            });
        } else {
            eprintln!("[family] revoke notice from {remote_id} ignored: unknown family or sender");
        }

        Ok(())
    }
}

impl ProtocolHandler for DeviceProtocol {
    async fn accept(&self, connection: Connection) -> std::result::Result<(), AcceptError> {
        let remote_id = connection.remote_id();

        // Serve every stream the peer opens, not just the first: clients pool
        // device connections and reuse them for follow-up requests (sync,
        // epoch push, revoke). Parking after one request would leave every
        // later request on the same connection unread until its timeout.
        while let Ok((mut send, mut recv)) = connection.accept_bi().await {
            let bytes = read_prefixed_bytes(&mut recv).await?;
            let wire = DeviceWire::from_bytes(&bytes).map_err(AcceptError::from_err)?;

            let result = match wire {
                DeviceWire::Invite {
                    user,
                    nonce,
                    roster,
                } => {
                    self.accept_invite(&connection, &mut send, &mut recv, user, nonce, roster)
                        .await
                }
                DeviceWire::SyncRequest { family_id, epoch } => {
                    self.accept_sync(remote_id, &mut send, family_id, epoch)
                        .await
                }
                DeviceWire::EpochUpdate {
                    roster,
                    epoch_secret,
                } => {
                    self.accept_epoch_update(remote_id, &mut send, roster, epoch_secret)
                        .await
                }
                DeviceWire::Revoked { family_id } => {
                    self.accept_revoked(remote_id, family_id).await
                }
                DeviceWire::ConfigSyncRequest { entries } => {
                    self.accept_config_sync(remote_id, &mut send, entries).await
                }
                _ => Err(Error::DeviceProtocol("unexpected opening frame".into())),
            };

            result.map_err(AcceptError::from_err)?;

            let _ = send.finish();
        }

        Ok(())
    }
}

async fn read_wire(recv: &mut iroh::endpoint::RecvStream, timeout: Duration) -> Result<DeviceWire> {
    let bytes = tokio::time::timeout(timeout, read_prefixed_bytes(recv)).await??;
    DeviceWire::from_bytes(&bytes)
}

async fn read_wire_plain(recv: &mut iroh::endpoint::RecvStream) -> Result<DeviceWire> {
    let bytes = read_prefixed_bytes(recv).await?;
    DeviceWire::from_bytes(&bytes)
}

#[cfg(test)]
mod tests {
    use iroh::SecretKey;

    use super::*;
    use crate::family::roster::{RosterDoc, RosterMember};

    #[test]
    fn existing_wire_variants_keep_their_indices() {
        let cases = [
            (5u8, DeviceWire::WelcomeAck),
            (7, DeviceWire::EpochAck),
            (
                8,
                DeviceWire::SyncRequest {
                    family_id: [0u8; 32],
                    epoch: 1,
                },
            ),
            (
                10,
                DeviceWire::Revoked {
                    family_id: [0u8; 32],
                },
            ),
        ];

        for (index, wire) in cases {
            assert_eq!(wire.to_bytes()[0], index);
        }
    }

    fn member(key: &SecretKey) -> RosterMember {
        let endpoint_id = key.public();
        RosterMember {
            endpoint_id,
            name: "dev".to_string(),
            platform: Platform::Macos,
            ticket: EndpointTicket::from(iroh::EndpointAddr::from(endpoint_id)),
        }
    }

    fn state(family_id: [u8; 32], epoch: u64, members: &[&SecretKey]) -> FamilyState {
        let author = members[0];
        let doc = RosterDoc {
            version: 0,
            family_id,
            epoch,
            members: members.iter().map(|k| member(k)).collect(),
            author: author.public(),
            issued_at_ms: 0,
        };
        FamilyState {
            family_id,
            epoch,
            epoch_secret: [1u8; 32],
            roster: SignedRoster::sign(doc, author).unwrap(),
        }
    }

    #[test]
    fn member_epoch_comparison() {
        let a = SecretKey::generate();
        let b = SecretKey::generate();
        let ours = state([1; 32], 5, &[&a, &b]);

        assert_eq!(
            sync_verdict(&ours, &[], &b.public(), [1; 32], 5),
            SyncVerdict::UpToDate
        );
        assert_eq!(
            sync_verdict(&ours, &[], &b.public(), [1; 32], 4),
            SyncVerdict::SendUpdate
        );
        assert_eq!(
            sync_verdict(&ours, &[], &b.public(), [1; 32], 6),
            SyncVerdict::Behind {
                requester_is_member: true
            }
        );
    }

    /// Regression: a member that hasn't heard the newest roster yet must not
    /// answer NotMember to a freshly added device — the requester would treat
    /// it as a kick and wipe its family state.
    #[test]
    fn stale_roster_never_ejects_newer_requester() {
        let a = SecretKey::generate();
        let b = SecretKey::generate();
        let newcomer = SecretKey::generate();
        let ours = state([1; 32], 1, &[&a, &b]);

        assert_eq!(
            sync_verdict(&ours, &[], &newcomer.public(), [1; 32], 2),
            SyncVerdict::Behind {
                requester_is_member: false
            }
        );
    }

    #[test]
    fn non_member_at_same_or_older_epoch_is_rejected() {
        let a = SecretKey::generate();
        let b = SecretKey::generate();
        let stranger = SecretKey::generate();
        let ours = state([1; 32], 5, &[&a, &b]);

        assert_eq!(
            sync_verdict(&ours, &[], &stranger.public(), [1; 32], 5),
            SyncVerdict::NotMember
        );
        assert_eq!(
            sync_verdict(&ours, &[], &stranger.public(), [1; 32], 3),
            SyncVerdict::NotMember
        );
    }

    #[test]
    fn merge_forwarding_for_previous_family_members() {
        let a = SecretKey::generate();
        let b = SecretKey::generate();
        let absorbed = SecretKey::generate();
        let stranger = SecretKey::generate();
        let ours = state([1; 32], 5, &[&a, &b, &absorbed]);

        let previous = vec![PreviousFamily {
            family_id: hex::encode([9u8; 32]),
            members: vec![absorbed.public()],
            merged_at_ms: 0,
        }];

        // Absorbed device asking about its old family gets the new roster.
        assert_eq!(
            sync_verdict(&ours, &previous, &absorbed.public(), [9; 32], 7),
            SyncVerdict::SendUpdate
        );
        // A stranger asking about that family does not.
        assert_eq!(
            sync_verdict(&ours, &previous, &stranger.public(), [9; 32], 7),
            SyncVerdict::UnknownFamily
        );
        // Unknown family id entirely.
        assert_eq!(
            sync_verdict(&ours, &[], &stranger.public(), [8; 32], 1),
            SyncVerdict::UnknownFamily
        );
    }
}
