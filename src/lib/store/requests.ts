import { invoke } from "@tauri-apps/api/core";
import { emit, listen } from "@tauri-apps/api/event";
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";
import { play } from "cuelume";
import { useMemo } from "react";
import { toast } from "sonner";
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
import {
	closeNotification,
	onNotificationAction,
	sendNotification,
} from "../notify";
import { humanReadableSize } from "../utils";
import { queryClient } from "./react-query";

interface RequestStore {
	requests: IncomingRequest[];

	appendRequest(request: IncomingRequest): void;
	popRequest(): void;
	removeRequest(id: number, type: IncomingRequest["type"]): void;
}

const currentWindow = getCurrentWebviewWindow();

/** Requests shown in the sidebar, as opposed to one that has moved to the code drawer. */
const isListedRequest = (request: IncomingRequest) =>
	request.type !== "device" || !request.acceptedFromNotification;

export const useShareRequestStore = create<RequestStore>((set) => ({
	requests: [],

	appendRequest: (request: IncomingRequest) => {
		set((state) => ({ requests: [...state.requests, request] }));
	},

	popRequest: () => {
		set((state) => {
			const first = state.requests.find(isListedRequest);
			if (!first) return state;
			return { requests: state.requests.filter((r) => r !== first) };
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

export const useShareRequests = () => {
	const requests = useShareRequestStore((s) => s.requests);
	return useMemo(() => requests.filter(isListedRequest), [requests]);
};

export const useNextDeviceRequest = (onlyAcceptedFromNotification = false) =>
	useShareRequestStore((s) => {
		const devices = s.requests.filter(
			(r): r is Extract<IncomingRequest, { type: "device" }> =>
				r.type === "device",
		);
		// One the user just accepted goes ahead of any that are still waiting for a decision.
		const accepted = devices.find((r) => r.acceptedFromNotification);
		return (
			accepted ?? (onlyAcceptedFromNotification ? null : devices[0]) ?? null
		);
	});

type StoredShareRequest = Extract<IncomingRequest, { type: "share" }>;
type StoredDeviceRequest = Extract<IncomingRequest, { type: "device" }>;

/**
 * Pending requests by notification id, so that a press answers exactly the request it was
 * shown for, unlike the shortcuts, which act on whichever request is next. The ids include
 * a session because the OS can still be holding notifications from an earlier run, whose
 * requests are gone even if the same request id has since been reused.
 */
const requestNotifications = new Map<string, IncomingRequest>();
const notificationSession = crypto.randomUUID();
let notificationCount = 0;

const notifyRequest = async (
	request: IncomingRequest,
	content: { title: string; body: string },
) => {
	notificationCount += 1;
	const id = `request-${notificationSession}-${notificationCount}`;
	requestNotifications.set(id, request);

	const shown = await sendNotification({
		id,
		...content,
		persistent: true,
		actions: [
			{ id: "accept", label: i18n.t("common:accept") },
			{ id: "reject", label: i18n.t("common:reject"), destructive: true },
		],
	});
	if (!shown) requestNotifications.delete(id);
};

const notifyShareRequest = (request: StoredShareRequest) => {
	const details = {
		count: request.info.totalFiles,
		size: humanReadableSize(request.info.size),
	};
	return notifyRequest(request, {
		title: i18n.t("share:incoming_request_title"),
		body: request.peer.name
			? i18n.t("share:incoming_request_description", {
					...details,
					peer: request.peer.name,
				})
			: i18n.t("notifications:share_request_description", details),
	});
};

const notifyDeviceRequest = (request: StoredDeviceRequest) => {
	const peer =
		request.peer.name ||
		i18n.t("peers:peer_default_name", {
			id: request.peer.endpointId.slice(-4),
		});
	return notifyRequest(request, {
		title: i18n.t("peers:device_request_title"),
		body: i18n.t("peers:device_request_description", { peer }),
	});
};

const answerShareRequest = async (
	request: StoredShareRequest,
	accepted: boolean,
) => {
	await invoke("answer_share_request", {
		requestId: request.requestId,
		accepted,
	});
	if (!accepted) return;

	await invoke("download", {
		ticket: request.info.ticket,
		peer: request.peer,
	});
};

const removeStoredRequest = (request: IncomingRequest) => {
	useShareRequestStore.setState((state) => ({
		requests: state.requests.filter((r) => r !== request),
	}));
};

const answerShareFromNotification = async (
	request: StoredShareRequest,
	accepted: boolean,
) => {
	removeStoredRequest(request);
	try {
		await answerShareRequest(request, accepted);
		play(accepted ? "ready" : "whisper");
	} catch (e) {
		if (!accepted) {
			console.error("[requests] reject failed", e);
			return;
		}
		await invoke("show_main_window");
		toastError(e, "errors:error_accepting_request");
	}
};

const answerDeviceFromNotification = async (
	request: StoredDeviceRequest,
	accepted: boolean,
) => {
	if (accepted) {
		// Accepting still takes the code from the other device, so hand this over to the
		// drawer. The request stays pending until the code is entered.
		useShareRequestStore.setState((state) => ({
			requests: state.requests.map((r) =>
				r === request ? { ...request, acceptedFromNotification: true } : r,
			),
		}));
		await invoke("show_main_window");
		return;
	}

	removeStoredRequest(request);
	try {
		await invoke("answer_device_invite", {
			sessionId: request.sessionId,
			accepted: false,
		});
		play("whisper");
	} catch (e) {
		console.error("[requests] reject failed", e);
	}
};

if (currentWindow.label === "main") {
	// However a request ends (answered in the app, cancelled, timed out), its notification
	// must go with it so that its buttons can't be pressed later.
	useShareRequestStore.subscribe(({ requests }) => {
		for (const [id, request] of requestNotifications) {
			if (!requests.includes(request)) {
				requestNotifications.delete(id);
				closeNotification(id);
			}
		}
	});

	onNotificationAction(async ({ id, actionId }) => {
		if (!id.startsWith("request-")) return;

		const request = requestNotifications.get(id);
		if (!request) {
			await invoke("show_main_window");
			toast.error(i18n.t("errors:share_request_expired"));
			return;
		}
		requestNotifications.delete(id);

		const accepted = actionId === "accept";
		if (request.type === "share") {
			await answerShareFromNotification(request, accepted);
		} else {
			await answerDeviceFromNotification(request, accepted);
		}
	});
}

listen<ShareRequest>("share_request", (event) => {
	const request: StoredShareRequest = { type: "share", ...event.payload };
	const { appendRequest } = useShareRequestStore.getState();

	appendRequest(request);

	if (currentWindow.label === "main") {
		emit("sound:play", "chime");
		notifyShareRequest(request);
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

	const request = requests.find(isListedRequest);
	if (!request) return;

	if (request.type !== "share") return;

	popRequest();

	try {
		await answerShareRequest(request, true);
		play("ready");
	} catch (e) {
		toastError(e, "errors:error_accepting_request");
	}
});

listen("shortcut:reject", async () => {
	if (currentWindow.label !== "main") return;
	const { requests, popRequest } = useShareRequestStore.getState();

	const request = requests.find(isListedRequest);
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
	const request: StoredDeviceRequest = { type: "device", ...event.payload };
	const { appendRequest } = useShareRequestStore.getState();

	appendRequest(request);

	if (currentWindow.label === "main") notifyDeviceRequest(request);
});
