import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";
import { useUserStore } from "@/lib/store/user";

export type NotificationOptions = {
	/** Showing another notification with the same id replaces this one. */
	id?: string;
	title: string;
	body?: string;
	actions?: { id: string; label: string; destructive?: boolean }[];
	persistent?: boolean;
	/** Shows a progress bar starting at this fraction, from 0 to 1. */
	progress?: number;
};

export type NotificationPermission =
	| "granted"
	| "denied"
	| "notDetermined"
	/** No notification service, such as under `tauri dev` on macOS. */
	| "unavailable";

export function getPermission() {
	return invoke<NotificationPermission>("notification_permission");
}

/** Shows the OS prompt if the user hasn't been asked yet. */
export function requestPermission() {
	return invoke<NotificationPermission>("request_notification_permission");
}

async function checkPermission() {
	const permission = await getPermission();
	if (permission === "notDetermined") {
		return (await requestPermission()) === "granted";
	}
	return permission === "granted";
}

export async function openNotificationSettings() {
	await invoke("open_notification_settings");
}

/** Returns whether a notification was actually shown. */
export async function sendNotification(
	options: NotificationOptions,
): Promise<boolean> {
	if (useUserStore.getState().user?.notifications === false) return false;

	try {
		const isFocused = await getCurrentWebviewWindow().isFocused();
		if (isFocused) return false;
		if (!(await checkPermission())) return false;

		return await invoke<boolean>("show_notification", {
			request: { id: crypto.randomUUID(), ...options },
		});
	} catch (e) {
		console.error("[notify] couldn't show notification", e);
		return false;
	}
}

export function closeNotification(id: string) {
	invoke("close_notification", { id }).catch((e) => {
		console.error("[notify] couldn't close notification", e);
	});
}

/** A notification's button was pressed. Only delivered to the main window. */
export function onNotificationAction(
	handler: (action: { id: string; actionId: string }) => void,
) {
	return listen<{ id: string; actionId: string }>(
		"notification:action",
		(event) => handler(event.payload),
	);
}
