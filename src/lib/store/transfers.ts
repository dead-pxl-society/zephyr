import { invoke } from "@tauri-apps/api/core";
import { emit, listen } from "@tauri-apps/api/event";
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";
import { play, type SoundName } from "cuelume";
import { toast } from "sonner";
import { create } from "zustand";
import type {
	ExportEvent,
	GetProgress,
	Peer,
	PeerInfo,
	PeerStatus,
	SendProgress,
	ShareInfo,
	ShareResponse,
} from "@/type";
import i18n from "../i18n";
import type { Parcel } from "./parcels";
import { queryClient } from "./react-query";

const currentWindow = getCurrentWebviewWindow();
const isMainWindow = currentWindow.label === "main";

/**
 * Sounds and persisted history are side effects that must happen once per
 * app, not once per webview. Both windows run these listeners, so only the
 * main window acts on them.
 */
const playSound = (name: SoundName) => {
	if (isMainWindow) play(name);
};

/** Fallback for a request the backend never resolves (peer accepted but never fetched). */
const REQUEST_TIMEOUT_MS = 60_000;

const ACTIVE_OUTBOUND: ReadonlySet<PeerStatus> = new Set([
	"connecting",
	"requested",
	"importing",
	"transfering",
]);

export interface OutboundTransfer {
	requestId: number;
	parcelId: number;
	endpointId: string;
	status: PeerStatus;
	bytesSent?: number;
	size?: number;
	files?: number;
	filePaths?: string[];
	to?: PeerInfo;
}

type OutboundTracker = {
	lastBytes: number;
	completedBytes: number;
};

type InboundStatus = "connecting" | "receiving" | "done" | "fail" | "exporting";

export interface InboundTransfer {
	id: number;
	status: InboundStatus;
	from?: PeerInfo;
	size?: number;
	files?: number;
	progress?: number;
	ticket?: string;
}

export interface StoredTransfer {
	id: string;
	createdAt: string;
	updatedAt: string;
	kind: "inbound" | "outbound";
	totalFiles: number;
	size: number;
	hash?: string;
	peer?: Peer | string;
	files?: string[];
}

interface TransferStore {
	outboundIds: string[];
	outbound: Record<string, OutboundTransfer>;
	requestKeyMap: Record<number, string>;
	inboundIds: number[];
	inbound: Record<number, InboundTransfer>;

	progressMap: Record<string | number, number>;
	trackerMap: Record<string, OutboundTracker>;

	transferCount: number;

	upsertOutbound: (transfer: OutboundTransfer) => void;
	getOutbound: (key: string) => OutboundTransfer | undefined;
	updateOutbound: (key: string, patch: Partial<OutboundTransfer>) => void;
	updateOutboundProgress: (key: string, bytesSent: number) => void;
	completeOutboundProgress: (key: string) => void;
	deleteOutbound: (key: string) => void;

	startInbound: (id: number, transfer: InboundTransfer) => void;
	getInbound: (id: number) => InboundTransfer | undefined;
	updateInbound: (id: number, patch: Partial<InboundTransfer>) => void;
	updateInboundProgress: (id: number, progress: number) => void;
	deleteInbound: (id: number) => void;

	setTransferCount: (newCount: number) => void;
	increaseTransferCount: () => void;
	decreaseTransferCount: () => void;
}

type OutboundSyncPayload = {
	origin: string;
	transfer: OutboundTransfer;
};

export const transferKey = (parcelId: number, endpointId: string): string =>
	`${parcelId}:${endpointId.slice(0, 10)}`;

export const useTransferStore = create<TransferStore>((set, get) => ({
	outboundIds: [],
	outbound: {},
	requestKeyMap: {},
	inboundIds: [],
	inbound: {},

	progressMap: {},
	trackerMap: {},
	transferCount: -1,

	upsertOutbound: (transfer: OutboundTransfer) => {
		const key = transferKey(transfer.parcelId, transfer.endpointId);
		set((state) => {
			const prev = state.outbound[key];
			const nextRequestKeyMap = { ...state.requestKeyMap };
			if (prev?.requestId != null) {
				delete nextRequestKeyMap[prev.requestId];
			}
			if (transfer.requestId >= 0) nextRequestKeyMap[transfer.requestId] = key;

			const nextIds = state.outboundIds.includes(key)
				? state.outboundIds
				: [key, ...state.outboundIds];

			const resetProgress =
				prev === undefined || prev.status !== transfer.status;
			const { [key]: staleProgress, ...progressMap } = state.progressMap;
			const { [key]: staleTracker, ...trackerMap } = state.trackerMap;

			return {
				outboundIds: nextIds,
				outbound: { ...state.outbound, [key]: transfer },
				requestKeyMap: nextRequestKeyMap,
				progressMap: resetProgress
					? progressMap
					: { ...progressMap, [key]: staleProgress },
				trackerMap: resetProgress
					? trackerMap
					: { ...trackerMap, [key]: staleTracker },
			};
		});
	},

	getOutbound: (key: string) => {
		const { outbound } = get();
		return outbound[key];
	},

	updateOutboundProgress: (key: string, bytesSent: number) => {
		set((state) => {
			const current = state.outbound[key];
			if (!current) return state;
			const size = current.size || 1;

			let { lastBytes, completedBytes } = state.trackerMap[key] ?? {
				lastBytes: 0,
				completedBytes: 0,
			};

			if (bytesSent < lastBytes) completedBytes += lastBytes;

			const bytes = completedBytes + bytesSent;
			const progress = Math.min(bytes / size, 1);

			lastBytes = bytesSent;

			return {
				trackerMap: {
					...state.trackerMap,
					[key]: { lastBytes, completedBytes },
				},
				progressMap: { ...state.progressMap, [key]: progress },
			};
		});
	},

	completeOutboundProgress: (key: string) => {
		set((state) => ({ progressMap: { ...state.progressMap, [key]: 1 } }));
	},

	updateOutbound: (key: string, patch: Partial<OutboundTransfer>) => {
		set((state) => {
			if (!state.outbound[key]) return state;

			return {
				outbound: {
					...state.outbound,
					[key]: {
						...state.outbound[key],
						...patch,
					},
				},
			};
		});
	},

	deleteOutbound: (key: string) => {
		set((state) => {
			const transfer = state.outbound[key];
			const { [key]: _, ...rest } = state.outbound;
			const { [key]: _progress, ...restProgress } = state.progressMap;
			const { [key]: _tracker, ...restTracker } = state.trackerMap;

			const newRequestKeyMap = { ...state.requestKeyMap };
			if (transfer?.requestId != null) {
				delete newRequestKeyMap[transfer.requestId];
			}

			return {
				outbound: rest,
				outboundIds: state.outboundIds.filter((x) => x !== key),
				progressMap: restProgress,
				trackerMap: restTracker,
				requestKeyMap: newRequestKeyMap,
			};
		});
	},

	startInbound: (id: number, transfer: InboundTransfer) => {
		set((state) => ({
			inboundIds: state.inboundIds.includes(id)
				? state.inboundIds
				: [id, ...state.inboundIds],
			inbound: {
				...state.inbound,
				[id]: transfer,
			},
		}));
	},

	getInbound: (id: number) => {
		const { inbound } = get();
		return inbound[id];
	},

	updateInboundProgress: (id: number, progress: number) => {
		set((state) => {
			const current = state.inbound[id];
			if (!current) return state;
			const newProgress = Math.min(progress / (current.size || 1), 1);

			return {
				progressMap: { ...state.progressMap, [id]: newProgress },
			};
		});
	},

	updateInbound: (id: number, patch: Partial<InboundTransfer>) => {
		set((state) => {
			const current = state.inbound[id];
			if (!current) return state;

			return {
				inbound: {
					...state.inbound,
					[id]: {
						...current,
						...patch,
						progress: undefined,
					},
				},
			};
		});
	},

	deleteInbound: (id: number) => {
		set((state) => {
			const { [id]: _, ...rest } = state.inbound;
			const { [id]: _progress, ...restProgress } = state.progressMap;
			return {
				inbound: rest,
				inboundIds: state.inboundIds.filter((x) => x !== id),
				progressMap: restProgress,
			};
		});
	},

	setTransferCount: (newCount: number) => {
		set(() => ({ transferCount: newCount }));
	},

	increaseTransferCount: () => {
		set((state) => ({ transferCount: state.transferCount + 1 }));
	},

	decreaseTransferCount: () => {
		set((state) => ({ transferCount: state.transferCount - 1 }));
	},
}));

export const useOutboundTransfer = (key: string | null) =>
	useTransferStore((s) => (key ? (s.outbound[key] ?? null) : null));

export const getOutboundTransfer = (key: string): OutboundTransfer | null => {
	const state = useTransferStore.getState();
	return state.outbound[key] ?? null;
};

export const useInboundTransfer = (id: number) =>
	useTransferStore((s) => s.inbound[id]);

export const useInboundTransferByTicket = (ticket: string | null) =>
	useTransferStore((s) => {
		if (!ticket) return null;
		for (const id of s.inboundIds) {
			if (s.inbound[id]?.ticket === ticket) {
				return s.inbound[id];
			}
		}
		return null;
	});

export const useInboundTransferProgressByTicket = (ticket: string | null) =>
	useTransferStore((s) => {
		if (!ticket) return null;
		for (const id of s.inboundIds) {
			if (s.inbound[id]?.ticket === ticket) {
				return s.progressMap[id] || 0;
			}
		}
		return null;
	});

export const useTransferProgress = (transferId: string | number | null) =>
	useTransferStore((s) =>
		transferId != null ? s.progressMap[transferId] || 0 : 0,
	);

export const useInboundTransfers = () => useTransferStore((s) => s.inboundIds);

export const useOutboundTransfers = () =>
	useTransferStore((s) => s.outboundIds);

export const useOutboundTransfersForPeer = (endpointId: string) => {
	const shortId = endpointId.slice(0, 10);
	return useTransferStore((s) =>
		s.outboundIds.filter((key) => key.endsWith(shortId)),
	);
};

export const isActiveOutbound = (status: PeerStatus) =>
	ACTIVE_OUTBOUND.has(status);

const storeTransfer = async (
	newTransfer: Partial<StoredTransfer>,
	peer: string | undefined = undefined,
) => {
	if (!isMainWindow) return;
	try {
		await invoke("create_transfer_cmd", { newTransfer, peer });
	} catch (exception) {
		console.error("[transfers] failed to store transfer", exception);
	}
};

type ProgressTask =
	| { kind: "inbound"; id: number; progress: number }
	| { kind: "outbound"; id: string; progress: number };

const pendingProgress = new Map<string | number, ProgressTask>();

let frameScheduled = false;

function flushProgressFrame() {
	frameScheduled = false;

	const { updateInboundProgress, updateOutboundProgress } =
		useTransferStore.getState();

	for (const task of pendingProgress.values()) {
		if (task.kind === "inbound") {
			updateInboundProgress(task.id, task.progress);
		} else {
			updateOutboundProgress(task.id, task.progress);
		}
	}

	pendingProgress.clear();
}

function scheduleProgress(task: ProgressTask) {
	pendingProgress.set(task.id, task);

	if (!frameScheduled) {
		frameScheduled = true;
		requestAnimationFrame(flushProgressFrame);
	}
}

const streamKeyMap = new Map<string, string>();
const cleanupTimers = new Map<string, ReturnType<typeof setTimeout>>();
const requestTimers = new Map<string, ReturnType<typeof setTimeout>>();
const pendingResponses = new Map<number, ShareResponse["type"]>();

const streamId = (connectionId: number, requestId: number) =>
	`${connectionId}:${requestId}`;

const clearStreams = (key: string) => {
	for (const [stream, mapped] of streamKeyMap) {
		if (mapped === key) streamKeyMap.delete(stream);
	}
};

const cancelScheduledDelete = (key: string) => {
	const timer = cleanupTimers.get(key);
	if (timer === undefined) return;

	clearTimeout(timer);
	cleanupTimers.delete(key);
};

const cancelRequestTimeout = (key: string) => {
	const timer = requestTimers.get(key);
	if (timer === undefined) return;

	clearTimeout(timer);
	requestTimers.delete(key);
};

function scheduleDeleteOutbound(key: string, delayMs: number) {
	cancelScheduledDelete(key);
	cancelRequestTimeout(key);

	const timer = setTimeout(() => {
		cleanupTimers.delete(key);
		clearStreams(key);
		pendingProgress.delete(key);
		useTransferStore.getState().deleteOutbound(key);
	}, delayMs);

	cleanupTimers.set(key, timer);
}

function armRequestTimeout(key: string) {
	cancelRequestTimeout(key);

	const timer = setTimeout(() => {
		requestTimers.delete(key);
		const { outbound, updateOutbound } = useTransferStore.getState();
		if (outbound[key]?.status !== "requested") return;

		updateOutbound(key, { status: "timeout" });
		scheduleDeleteOutbound(key, 1500);
	}, REQUEST_TIMEOUT_MS);

	requestTimers.set(key, timer);
}

function resetOutboundTracking(key: string) {
	cancelScheduledDelete(key);
	cancelRequestTimeout(key);
	clearStreams(key);
	pendingProgress.delete(key);
}

/** Mirror an outbound entry to the other webview so both show the same status. */
function syncOutbound(transfer: OutboundTransfer) {
	const payload: OutboundSyncPayload = {
		origin: currentWindow.label,
		transfer,
	};
	emit("ui:outbound_sync", payload);
}

function applyShareResponse(key: string, type: ShareResponse["type"]) {
	const { outbound, updateOutbound } = useTransferStore.getState();
	const current = outbound[key];
	if (!current || type === "accepted") return;

	cancelRequestTimeout(key);
	updateOutbound(key, { status: type === "unknown" ? "fail" : type });
	scheduleDeleteOutbound(key, 1500);
}

/**
 * Send a parcel to a peer. The outbound entry exists from the first moment
 * (status `connecting`) so the UI never looks idle while the backend dials,
 * a second click on the same peer is ignored, and a failure shows up as the
 * card's failed state. Resolves to whether the request went out.
 */
export async function pushParcelToPeer(
	parcel: Parcel,
	peer: PeerInfo,
): Promise<boolean> {
	const key = transferKey(parcel.id, peer.endpointId);
	const store = useTransferStore.getState();

	const existing = store.outbound[key];
	if (existing && ACTIVE_OUTBOUND.has(existing.status)) return false;

	resetOutboundTracking(key);

	const transfer: OutboundTransfer = {
		requestId: -1,
		parcelId: parcel.id,
		endpointId: peer.endpointId,
		status: "connecting",
		to: peer,
		files: parcel.totalFiles || 0,
		filePaths: parcel.files?.map((f) => f.path) ?? [],
		size: parcel.size || 0,
	};
	store.upsertOutbound(transfer);
	syncOutbound(transfer);

	const info: ShareInfo = {
		ticket: parcel.ticket || "",
		totalFiles: parcel.totalFiles || 0,
		size: parcel.size || 0,
	};

	try {
		const requestId = await invoke<number>("push", {
			endpointId: peer.endpointId,
			info,
		});

		const requested: OutboundTransfer = {
			...transfer,
			requestId,
			status: "requested",
		};
		store.upsertOutbound(requested);
		syncOutbound(requested);
		armRequestTimeout(key);

		const early = pendingResponses.get(requestId);
		if (early !== undefined) {
			pendingResponses.delete(requestId);
			applyShareResponse(key, early);
		}

		return true;
	} catch (e) {
		const failed: OutboundTransfer = { ...transfer, status: "fail" };
		store.upsertOutbound(failed);
		syncOutbound(failed);
		scheduleDeleteOutbound(key, 1500);

		console.error("[transfers] push failed", e);

		return false;
	}
}

listen<SendProgress>("send_progress", (event) => {
	const { type, endpointId, connectionId, progress, requestId } = event.payload;
	const {
		outbound,
		outboundIds,
		updateOutbound,
		getOutbound,
		completeOutboundProgress,
	} = useTransferStore.getState();

	const stream = streamId(connectionId, requestId);
	let key = streamKeyMap.get(stream);

	if (!key) {
		if (type !== "started") return;

		const shortEventPeerId = endpointId.slice(0, 10);
		key = outboundIds.find((k) => {
			const t = outbound[k];
			return (
				t &&
				t.endpointId.slice(0, 10) === shortEventPeerId &&
				(t.status === "requested" || t.status === "transfering")
			);
		});

		if (!key) return;

		streamKeyMap.set(stream, key);
	}

	if (type === "started") {
		cancelRequestTimeout(key);
		updateOutbound(key, { status: "transfering" });
	} else if (type === "progress") {
		scheduleProgress({
			kind: "outbound",
			id: key,
			progress: progress || 0,
		});
	} else if (type === "completed") {
		streamKeyMap.delete(stream);
		flushProgressFrame();
		completeOutboundProgress(key);

		updateOutbound(key, { status: "done" });

		const current = getOutbound(key);
		const newTransfer: Partial<StoredTransfer> = {
			kind: "outbound",
			size: current?.size || 0,
			totalFiles: current?.files || 0,
			files: current?.filePaths ?? [],
		};
		storeTransfer(newTransfer, current?.to?.endpointId);

		playSound("sparkle");
		scheduleDeleteOutbound(key, 2000);
		setTimeout(() => {
			queryClient.invalidateQueries({ queryKey: ["transfers"] });
		}, 2000);
	} else if (type === "aborted") {
		streamKeyMap.delete(stream);
		updateOutbound(key, { status: "fail" });

		playSound("error");
		if (isMainWindow) toast.error(i18n.t("errors:transfer_failed"));
		scheduleDeleteOutbound(key, 1500);
	}
});

listen<GetProgress>("get_progress", (event) => {
	const {
		type,
		progress,
		totalFiles,
		totalSize,
		transferId,
		from,
		ticket,
		error,
	} = event.payload;
	const { startInbound, updateInbound, deleteInbound, getInbound } =
		useTransferStore.getState();

	if (type === "connecting") {
		startInbound(transferId, {
			id: transferId,
			status: "connecting",
			from,
			ticket,
		});
	} else if (type === "started") {
		const current = getInbound(transferId);
		startInbound(transferId, {
			id: transferId,
			status: "receiving",
			files: totalFiles ?? current?.files,
			size: totalSize ?? current?.size,
			from: from ?? current?.from,
			ticket: ticket ?? current?.ticket,
		});
	} else if (type === "progress") {
		scheduleProgress({
			kind: "inbound",
			id: transferId,
			progress: progress || 0,
		});
	} else if (type === "done") {
		updateInbound(transferId, { status: "exporting" });
	} else if (type === "error") {
		const current = getInbound(transferId);

		if (current?.status === "done") {
			console.warn("[transfers] cleanup failed after transfer", error);
			return;
		}

		if (current) updateInbound(transferId, { status: "fail" });

		if (isMainWindow) {
			console.error("[transfers] receive failed", error);
			toast.error(i18n.t("errors:receive_failed"));
		}

		playSound("error");
		setTimeout(() => {
			deleteInbound(transferId);
		}, 1500);
	}
});

listen<ShareResponse>("share_response", (event) => {
	const { type, requestId } = event.payload;
	const { requestKeyMap } = useTransferStore.getState();

	const key = requestKeyMap[requestId];
	if (!key) {
		pendingResponses.set(requestId, type);
		return;
	}

	applyShareResponse(key, type);
});

listen<OutboundSyncPayload>("ui:outbound_sync", (event) => {
	const { origin, transfer } = event.payload;
	if (origin === currentWindow.label) return;

	const key = transferKey(transfer.parcelId, transfer.endpointId);
	if (transfer.status === "connecting") resetOutboundTracking(key);

	useTransferStore.getState().upsertOutbound(transfer);

	if (transfer.status === "requested") armRequestTimeout(key);
	if (transfer.status === "fail") scheduleDeleteOutbound(key, 1500);
});

listen<ExportEvent>("export_event", (event) => {
	const { type, transferId, paths, error } = event.payload;
	const { getInbound, deleteInbound, updateInbound, startInbound } =
		useTransferStore.getState();

	if (type === "finished") {
		const current = getInbound(transferId) ?? {
			id: transferId,
			status: "exporting" as const,
			files: paths?.length ?? 0,
		};
		startInbound(transferId, { ...current, status: "done" });

		const newTransfer: Partial<StoredTransfer> = {
			kind: "inbound",
			size: current.size || 0,
			totalFiles: current.files || paths?.length || 0,
			files: paths,
		};
		storeTransfer(newTransfer, current.from?.endpointId);

		playSound("success");
		setTimeout(() => {
			queryClient.invalidateQueries({ queryKey: ["transfers"] });
			deleteInbound(transferId);
		}, 1000);
	} else if (type === "error") {
		updateInbound(transferId, { status: "fail" });

		if (isMainWindow) {
			console.error("[transfers] export failed", error);
			toast.error(i18n.t("errors:export_failed"));
		}

		playSound("error");
		setTimeout(() => {
			deleteInbound(transferId);
		}, 1500);
	}
});
