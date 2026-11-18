//! Transport for clipboard blobs between a user's own devices.
//!
//! Two ALPNs serve the same in-memory store: [`CLIP_LZ4_ALPN`] wraps every stream in
//! LZ4, while [`CLIP_ALPN`] is plain iroh-blobs and stays registered so devices on
//! releases without compression can still fetch from us and serve to us. A fetch
//! offers both and lets the provider pick, so the choice costs no extra round trip.

use std::{io, time::Duration};

use async_compression::tokio::{bufread::Lz4Decoder, write::Lz4Encoder};
use iroh::{
    Endpoint, EndpointAddr,
    endpoint::{ConnectError, ConnectOptions, Connection, VarInt},
    protocol::{AcceptError, ProtocolHandler},
};
use iroh_blobs::{
    HashAndFormat,
    api::Store,
    get, provider,
    provider::events::EventSender,
    util::{AsyncReadRecvStream, AsyncReadRecvStreamExtra, SendStream},
};
use tokio::io::{AsyncRead, AsyncWriteExt, BufReader};

use crate::error::Result;

pub const CLIP_ALPN: &[u8] = b"zephyr/clip/0";
pub const CLIP_LZ4_ALPN: &[u8] = b"zephyr/clip-lz4/0";

const CONNECT_TIMEOUT: Duration = Duration::from_secs(10);

/// Most copied files (images, PDFs, archives, office documents) are already compressed,
/// so the codec has to be cheap enough to be harmless on those: LZ4 gives up on
/// incompressible input at close to memcpy speed, where zstd would cost real CPU.
struct Lz4Send {
    encoder: Lz4Encoder<iroh::endpoint::SendStream>,
    finished: bool,
}

impl Lz4Send {
    fn wrap(inner: iroh::endpoint::SendStream) -> Self {
        Self {
            encoder: Lz4Encoder::new(inner),
            finished: false,
        }
    }
}

impl SendStream for Lz4Send {
    async fn send_bytes(&mut self, bytes: bytes::Bytes) -> io::Result<()> {
        self.encoder.write_all(&bytes).await
    }

    async fn send(&mut self, buf: &[u8]) -> io::Result<()> {
        self.encoder.write_all(buf).await
    }

    /// Ends the LZ4 frame and finishes the QUIC stream rather than just flushing.
    /// iroh-blobs calls `sync` once per direction, when it is done writing, then drops
    /// the writer; and the reading side calls `expect_eof`, which the decoder only
    /// reports cleanly once it has seen the frame's end mark.
    async fn sync(&mut self) -> io::Result<()> {
        if !self.finished {
            self.encoder.shutdown().await?;
            self.finished = true;
        }
        Ok(())
    }

    fn reset(&mut self, code: VarInt) -> io::Result<()> {
        Ok(self.encoder.get_mut().reset(code)?)
    }

    async fn stopped(&mut self) -> io::Result<Option<VarInt>> {
        self.encoder.get_mut().stopped().await
    }

    fn id(&self) -> u64 {
        self.encoder.get_ref().id().index()
    }
}

struct Lz4Recv(Lz4Decoder<BufReader<iroh::endpoint::RecvStream>>);

impl Lz4Recv {
    fn wrap(inner: iroh::endpoint::RecvStream) -> AsyncReadRecvStream<Self> {
        AsyncReadRecvStream::new(Self(Lz4Decoder::new(BufReader::new(inner))))
    }
}

impl AsyncReadRecvStreamExtra for Lz4Recv {
    fn inner(&mut self) -> &mut (impl AsyncRead + Unpin + Send) {
        &mut self.0
    }

    fn stop(&mut self, code: VarInt) -> io::Result<()> {
        Ok(self.0.get_mut().get_mut().stop(code)?)
    }

    fn id(&self) -> u64 {
        self.0.get_ref().get_ref().id().index()
    }
}

/// iroh-blobs provider for [`CLIP_LZ4_ALPN`].
///
/// Does not shut the store down on router shutdown: the plain `BlobsProtocol` on
/// [`CLIP_ALPN`] shares the store and already does.
#[derive(Debug, Clone)]
pub struct Lz4BlobsProtocol {
    store: Store,
}

impl Lz4BlobsProtocol {
    pub fn new(store: &Store) -> Self {
        Self {
            store: store.clone(),
        }
    }
}

impl ProtocolHandler for Lz4BlobsProtocol {
    async fn accept(&self, conn: Connection) -> std::result::Result<(), AcceptError> {
        let connection_id = conn.stable_id() as u64;
        while let Ok((send, recv)) = conn.accept_bi().await {
            let pair = provider::StreamPair::new(
                connection_id,
                Lz4Recv::wrap(recv),
                Lz4Send::wrap(send),
                EventSender::DEFAULT,
            );
            tokio::spawn(provider::handle_stream(pair, self.store.clone()));
        }
        Ok(())
    }
}

/// The provider's ALPN preference decides which protocol is used: new devices register
/// [`CLIP_LZ4_ALPN`] first, older ones only accept [`CLIP_ALPN`].
pub async fn connect(
    endpoint: &Endpoint,
    addr: impl Into<EndpointAddr>,
) -> std::result::Result<Connection, ConnectError> {
    let options = ConnectOptions::new().with_additional_alpns(vec![CLIP_ALPN.to_vec()]);
    let connecting = endpoint
        .connect_with_opts(addr, CLIP_LZ4_ALPN, options)
        .await?;
    Ok(connecting.await?)
}

/// Fetches `content` from the device at `addr` into `store`. Each fetch gets its own
/// connection: copies are infrequent enough that pooling would only hold sockets open.
pub async fn fetch(
    endpoint: &Endpoint,
    addr: impl Into<EndpointAddr>,
    store: &Store,
    content: HashAndFormat,
) -> Result<()> {
    let conn = tokio::time::timeout(CONNECT_TIMEOUT, connect(endpoint, addr)).await??;
    let result = fetch_over(&conn, store, content).await;
    conn.close(VarInt::from_u32(0), b"done");
    result
}

async fn fetch_over(conn: &Connection, store: &Store, content: HashAndFormat) -> Result<()> {
    if conn.alpn() == CLIP_LZ4_ALPN {
        let (send, recv) = conn.open_bi().await?;
        let pair = get::StreamPair::new(
            conn.stable_id() as u64,
            Lz4Recv::wrap(recv),
            Lz4Send::wrap(send),
        );
        store.remote().fetch(pair, content).await?;
    } else {
        store.remote().fetch(conn.clone(), content).await?;
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use std::net::{Ipv4Addr, SocketAddr};

    use iroh::{RelayMode, endpoint::presets, protocol::Router};
    use iroh_blobs::{BlobsProtocol, format::collection::Collection, store::mem::MemStore};

    use super::*;

    async fn bind() -> Endpoint {
        Endpoint::builder(presets::Minimal)
            .relay_mode(RelayMode::Disabled)
            .bind()
            .await
            .unwrap()
    }

    fn loopback_addr(endpoint: &Endpoint) -> EndpointAddr {
        let port = endpoint
            .bound_sockets()
            .into_iter()
            .find(SocketAddr::is_ipv4)
            .unwrap()
            .port();
        EndpointAddr::new(endpoint.id()).with_ip_addr((Ipv4Addr::LOCALHOST, port).into())
    }

    /// Deterministic incompressible bytes, so one collection exercises both an LZ4
    /// stream that shrinks and one that does not.
    fn noise(len: usize) -> Vec<u8> {
        let mut state = 0x9e37_79b9_7f4a_7c15u64;
        (0..len)
            .map(|_| {
                state ^= state << 13;
                state ^= state >> 7;
                state ^= state << 17;
                state as u8
            })
            .collect()
    }

    struct Provider {
        router: Router,
        store: MemStore,
    }

    async fn provider(lz4: bool) -> Provider {
        let store = MemStore::new();
        let mut builder = Router::builder(bind().await);
        if lz4 {
            builder = builder.accept(CLIP_LZ4_ALPN, Lz4BlobsProtocol::new(&store));
        }
        let router = builder
            .accept(CLIP_ALPN, BlobsProtocol::new(&store, None))
            .spawn();
        Provider { router, store }
    }

    async fn add_collection(store: &MemStore, files: &[(&str, Vec<u8>)]) -> HashAndFormat {
        let mut collection = Collection::default();
        let mut tags = Vec::new();
        for (name, data) in files {
            let tag = store.add_bytes(data.clone()).temp_tag().await.unwrap();
            collection.push(name.to_string(), tag.hash());
            tags.push(tag);
        }
        let tag = collection.store(store).await.unwrap();
        let content = HashAndFormat::hash_seq(tag.hash());
        std::mem::forget(tags);
        std::mem::forget(tag);
        content
    }

    async fn assert_fetches_collection(provider: &Provider, client: &Endpoint) {
        let files = [
            ("notes.txt", "clipboard ".repeat(200_000).into_bytes()),
            ("photo.jpg", noise(300_000)),
            ("empty", Vec::new()),
        ];
        let content = add_collection(&provider.store, &files).await;

        let local = MemStore::new();
        fetch(
            client,
            loopback_addr(provider.router.endpoint()),
            &local,
            content,
        )
        .await
        .unwrap();

        let collection = Collection::load(content.hash, &*local).await.unwrap();
        let fetched: Vec<_> = collection.iter().collect();
        assert_eq!(fetched.len(), files.len());
        for ((name, hash), (want_name, want_data)) in fetched.into_iter().zip(&files) {
            assert_eq!(name, want_name);
            assert_eq!(
                local.get_bytes(*hash).await.unwrap().as_ref(),
                &want_data[..]
            );
        }
    }

    #[tokio::test]
    async fn negotiates_lz4_with_a_provider_that_offers_it() {
        let provider = provider(true).await;
        let client = bind().await;

        let conn = connect(&client, loopback_addr(provider.router.endpoint()))
            .await
            .unwrap();
        assert_eq!(conn.alpn(), CLIP_LZ4_ALPN);
        conn.close(VarInt::from_u32(0), b"");

        assert_fetches_collection(&provider, &client).await;
    }

    #[tokio::test]
    async fn lz4_shrinks_compressible_payloads_on_the_wire() {
        let provider = provider(true).await;
        let client = bind().await;
        let text = "clipboard ".repeat(200_000).into_bytes();
        let content = add_collection(&provider.store, &[("notes.txt", text.clone())]).await;
        let addr = loopback_addr(provider.router.endpoint());

        let received = async |conn: Connection| {
            fetch_over(&conn, &MemStore::new(), content).await.unwrap();
            let bytes = conn.stats().udp_rx.bytes;
            conn.close(VarInt::from_u32(0), b"");
            bytes
        };

        let lz4 = connect(&client, addr.clone()).await.unwrap();
        assert_eq!(lz4.alpn(), CLIP_LZ4_ALPN);
        let compressed = received(lz4).await;

        let plain = client.connect(addr, CLIP_ALPN).await.unwrap();
        let uncompressed = received(plain).await;

        assert!(uncompressed > text.len() as u64);
        assert!(
            compressed < uncompressed / 10,
            "{compressed} vs {uncompressed}"
        );
    }

    #[tokio::test]
    async fn falls_back_to_plain_blobs_for_a_provider_without_lz4() {
        let provider = provider(false).await;
        let client = bind().await;

        let conn = connect(&client, loopback_addr(provider.router.endpoint()))
            .await
            .unwrap();
        assert_eq!(conn.alpn(), CLIP_ALPN);
        conn.close(VarInt::from_u32(0), b"");

        assert_fetches_collection(&provider, &client).await;
    }

    #[tokio::test]
    async fn still_serves_clients_that_only_speak_plain_blobs() {
        let provider = provider(true).await;
        let client = bind().await;
        let content = add_collection(&provider.store, &[("a.txt", b"hello".to_vec())]).await;

        let conn = client
            .connect(loopback_addr(provider.router.endpoint()), CLIP_ALPN)
            .await
            .unwrap();
        let local = MemStore::new();
        local.remote().fetch(conn, content).await.unwrap();

        let collection = Collection::load(content.hash, &*local).await.unwrap();
        let (_, hash) = collection.iter().next().unwrap();
        assert_eq!(local.get_bytes(*hash).await.unwrap().as_ref(), b"hello");
    }
}
