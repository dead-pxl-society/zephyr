import { invoke } from "@tauri-apps/api/core";
import { emit, listen } from "@tauri-apps/api/event";
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";
import {
	sendNotification as _sendNotification,
	isPermissionGranted,
	type Options,
	requestPermission,
} from "@tauri-apps/plugin-notification";
import type { SoundName } from "cuelume";
import { useUserStore } from "@/lib/store/user";
import i18n from "./i18n";

type NotificationEvent = {
	title: string;
	body?: string;
	sound?: SoundName;
	args?: Record<string, unknown>;
};

async function checkPermission() {
	if (!(await isPermissionGranted())) {
		return (await requestPermission()) === "granted";
	}
	return true;
}

export async function openNotificationSettings() {
	await invoke("open_notification_settings");
}

export async function sendNotification(options: Options) {
	if (useUserStore.getState().user?.notifications === false) return;

	const isFocused = await getCurrentWebviewWindow().isFocused();
	if (isFocused) return;
	if (!(await checkPermission())) {
		console.log("no permission");
		return;
	}
	_sendNotification(options);
}

listen<NotificationEvent>("notify", (event) => {
	const { title, body, sound, args } = event.payload;

	const translatedBody = body ? i18n.t(body, args) : "";

	if (sound) emit("sound:play", sound);

	sendNotification({ title: i18n.t(title, args), body: translatedBody });
});
