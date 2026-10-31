import { invoke } from "@tauri-apps/api/core";
import { emit, listen } from "@tauri-apps/api/event";
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";
import { play } from "cuelume";
import { create } from "zustand";
import type {
	DevicePairingEvent,
	DeviceRequest,
	IncomingRequest,
	ShareRequest,
	ShareResponse,
} from "@/type";
import { toastError } from "../errors";
import i18n from "../i18n";
import { sendNotification } from "../notify";
import { humanReadableSize } from "../utils";
import { queryClient } from "./react-query";

interface RequestStore {
	requests: IncomingRequest[];

	appendRequest(request: IncomingRequest): void;
	popRequest(): void;
	removeRequest(id: number, type: IncomingRequest["type"]): void;
}

const currentWindow = getCurrentWebviewWindow();

export const useShareRequestStore = create<RequestStore>((set) => ({
	requests: [],

	appendRequest: (request: IncomingRequest) => {
		set((state) => ({ requests: [...state.requests, request] }));
	},

	popRequest: () => {
		set((state) => {
			if (state.requests.length === 0) return state;
			return { requests: [...state.requests.slice(1)] };
		});
	},

	removeRequest: (id: number, type: IncomingRequest["type"]) => {
		set((state) => {
			const index = state.requests.findIndex(
				(r) =>
					r.type === type &&
					(r.type === "share" ? r.requestId : r.sessionId) === id,
			);
			if (index === -1) return state;
			return {
				requests: [
					...state.requests.slice(0, index),
					...state.requests.slice(index + 1),
				],
			};
		});
	},
}));

export const useShareRequests = () => useShareRequestStore((s) => s.requests);

export const useNextDeviceRequest = () =>
	useShareRequestStore(
		(s) => s.requests.find((r) => r.type === "device") ?? null,
	);

listen<ShareRequest>("share_request", (event) => {
	const request = event.payload;
	const { appendRequest } = useShareRequestStore.getState();

	appendRequest({ type: "share", ...request });

	if (currentWindow.label === "main") {
		const size = humanReadableSize(request.info.size);
		const files = request.info.totalFiles;

		emit("sound:play", "chime");

		sendNotification({
			title: i18n.t("incoming_request_title", { ns: "share" }),
			body: i18n.t("share_request_description", {
				count: files,
				size,
				ns: "notifications",
			}),
		});
	}
});

listen<ShareResponse>("share_response", (event) => {
	const { type, requestId } = event.payload;
	const { removeRequest } = useShareRequestStore.getState();

	if (type === "cancelled" || type === "timeout") {
		removeRequest(requestId, "share");
	}
});

listen<DevicePairingEvent>("device:pairing", (event) => {
	const payload = event.payload;
	const { removeRequest } = useShareRequestStore.getState();

	if (
		payload.type === "cancelled" ||
		payload.type === "failed" ||
		(payload.type === "rejected" && payload.reason === "timeout")
	) {
		removeRequest(payload.sessionId, "device");
	}

	if (payload.type === "failed" && currentWindow.label === "main") {
		toastError(payload.reason, "errors:pairing_failed");
	}

	if (payload.type === "completed") {
		queryClient.invalidateQueries({ queryKey: ["contacts"] });
	}
});

listen("shortcut:accept", async () => {
	if (currentWindow.label !== "main") return;
	const { requests, popRequest } = useShareRequestStore.getState();

	const request = requests[0];
	if (!request) return;

	if (request.type !== "share") return;

	popRequest();

	try {
		await invoke("answer_share_request", {
			requestId: request.requestId,
			accepted: true,
		});
		await invoke("download", {
			ticket: request.info.ticket,
			peer: request.peer,
		});
		play("ready");
	} catch (e) {
		toastError(e, "errors:error_accepting_request");
	}
});

listen("shortcut:reject", async () => {
	if (currentWindow.label !== "main") return;
	const { requests, popRequest } = useShareRequestStore.getState();

	const request = requests[0];
	if (!request) return;

	popRequest();

	try {
		if (request.type === "share") {
			await invoke("answer_share_request", {
				requestId: request.requestId,
				accepted: false,
			});
		} else {
			await invoke("answer_device_invite", {
				sessionId: request.sessionId,
				accepted: false,
			});
		}
		play("whisper");
	} catch (e) {
		console.error("[requests] reject failed", e);
	}
});

listen<DeviceRequest>("device:invite_request", (event) => {
	const request = event.payload;
	const { appendRequest } = useShareRequestStore.getState();

	appendRequest({ type: "device", ...request });

	if (currentWindow.label === "main") {
		const peerName = request?.peer.name
			? request.peer.name
			: i18n.t("peers:peer_default_name", {
					id: request?.peer.endpointId.slice(-4),
				});

		sendNotification({
			title: i18n.t("peers:device_request_title"),
			body: i18n.t("peers:device_request_description", {
				peer: peerName,
			}),
		});
	}
});
