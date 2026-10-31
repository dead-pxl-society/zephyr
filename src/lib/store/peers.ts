import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { create } from "zustand";
import { shallow } from "zustand/shallow";
import { useStoreWithEqualityFn } from "zustand/traditional";
import { queryClient } from "@/lib/store/react-query";
import { isActiveOutbound, useTransferStore } from "@/lib/store/transfers";
import type { EphemeralPeer, Peer, PeerDiscovery } from "@/type";

interface PeerStore {
	peers: Map<string, EphemeralPeer>;
	setPeers: (peers: Map<string, EphemeralPeer>) => void;
	upsertPeer: (peer: EphemeralPeer) => void;
	setPeerData: (endpointId: string, peer: Peer) => void;
	removePeer: (id: string) => void;
	peersArray: () => EphemeralPeer[];
}

const EXPIRY_GRACE_MS = 600;
const TRANSFER_RECHECK_MS = 5000;

const expiryTimeouts = new Map<string, ReturnType<typeof setTimeout>>();

// trusted contact < contact < stranger
const peerRank = (peer: EphemeralPeer): number => {
	if (peer.peer?.kind !== "contact") return 2;
	return peer.peer.trustLevel === "trusted" ? 0 : 1;
};

const sortPeers = (peers: Map<string, EphemeralPeer>) =>
	new Map([...peers].sort(([, a], [, b]) => peerRank(a) - peerRank(b)));

// TODO: Figure out how we should emit, because if it comes from rust we shouldn't emit
export const usePeerStore = create<PeerStore>((set, get) => ({
	peers: new Map(),

	setPeers: (peers: Map<string, EphemeralPeer>) => {
		set({ peers });
	},

	upsertPeer: (peer: EphemeralPeer) => {
		set((state) => {
			const next = new Map(state.peers);
			next.set(peer.endpointId, peer);
			return { peers: sortPeers(next) };
		});
	},

	setPeerData: (endpointId: string, peer: Peer) => {
		set((state) => {
			const existing = state.peers.get(endpointId);
			if (!existing) return state;

			const next = new Map(state.peers);
			next.set(endpointId, { ...existing, peer });
			return { peers: sortPeers(next) };
		});
	},

	removePeer: (id: string) => {
		set((state) => {
			const next = new Map(state.peers);
			next.delete(id);
			return { peers: next };
		});
	},

	peersArray: () => Array.from(get().peers.values()),
}));

export async function hydratePeerStore() {
	const peers = await invoke<EphemeralPeer[]>("list_cached_peers");

	const map = new Map(peers.map((p) => [p.endpointId, p]));

	usePeerStore.setState({ peers: sortPeers(map) });
}

export const useNearbyPeers = () =>
	useStoreWithEqualityFn(
		usePeerStore,
		(s) => Array.from(s.peers.values()),
		shallow,
	);

function hasActiveOutbound(endpointId: string): boolean {
	const shortId = endpointId.slice(0, 10);
	const { outbound } = useTransferStore.getState();
	return Object.values(outbound).some(
		(t) => t.endpointId.slice(0, 10) === shortId && isActiveOutbound(t.status),
	);
}

function schedulePeerRemoval(endpointId: string, delayMs = EXPIRY_GRACE_MS) {
	if (expiryTimeouts.has(endpointId)) return;

	const timeout = setTimeout(() => {
		expiryTimeouts.delete(endpointId);

		// mDNS drops can be transient; keep the peer rendered mid-transfer
		if (hasActiveOutbound(endpointId)) {
			schedulePeerRemoval(endpointId, TRANSFER_RECHECK_MS);
			return;
		}

		usePeerStore.getState().removePeer(endpointId);
	}, delayMs);

	expiryTimeouts.set(endpointId, timeout);
}

function cancelPeerRemoval(endpointId: string) {
	const timeout = expiryTimeouts.get(endpointId);
	if (!timeout) return;

	clearTimeout(timeout);
	expiryTimeouts.delete(endpointId);
}

listen<Peer>("contact_added", (event) => {
	const peer = event.payload;

	usePeerStore.getState().setPeerData(peer.endpointId, peer);
	queryClient.invalidateQueries({ queryKey: ["contacts"] });
});

listen<PeerDiscovery>("peer_discovery", (event) => {
	const { type, peer } = event.payload;
	const { upsertPeer } = usePeerStore.getState();

	switch (type) {
		case "discovered":
		case "enriched": {
			cancelPeerRemoval(peer.endpointId);
			upsertPeer(peer);
			break;
		}

		case "expired": {
			schedulePeerRemoval(peer.endpointId);
			break;
		}
	}
});
