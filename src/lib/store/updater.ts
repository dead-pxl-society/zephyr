import { relaunch } from "@tauri-apps/plugin-process";
import { check, type Update } from "@tauri-apps/plugin-updater";
import { create } from "zustand";

export type UpdateStatus =
	| "idle"
	| "checking"
	| "available"
	| "downloading"
	| "installing"
	| "error";

interface UpdaterStore {
	status: UpdateStatus;
	version: string | null;
	downloaded: number;
	total: number | null;
	error: string | null;

	check(): Promise<boolean>;
	downloadAndInstall(): Promise<void>;
}

let pending: Update | null = null;

export const useUpdaterStore = create<UpdaterStore>((set, get) => ({
	status: "idle",
	version: null,
	downloaded: 0,
	total: null,
	error: null,

	check: async () => {
		if (get().status === "checking") return false;

		if (get().status === "downloading" || get().status === "installing") {
			return true;
		}

		set({ status: "checking", error: null });

		try {
			const update = await check();

			if (!update) {
				pending = null;
				set({ status: "idle", version: null });
				return false;
			}

			pending = update;
			set({ status: "available", version: update.version });
			return true;
		} catch (exception) {
			console.error("[updater.check] Error:", exception);
			pending = null;
			set({ status: "error", error: String(exception) });
			return false;
		}
	},

	downloadAndInstall: async () => {
		const update = pending;
		if (!update) return;

		const { status } = get();
		if (status === "downloading" || status === "installing") return;

		set({ status: "downloading", downloaded: 0, total: null, error: null });

		try {
			await update.downloadAndInstall((event) => {
				switch (event.event) {
					case "Started":
						set({ downloaded: 0, total: event.data.contentLength ?? null });
						break;
					case "Progress":
						set((state) => ({
							downloaded: state.downloaded + event.data.chunkLength,
						}));
						break;
					case "Finished":
						set({ status: "installing" });
						break;
				}
			});

			if (get().status !== "installing") set({ status: "installing" });

			await relaunch();
		} catch (exception) {
			console.error("[updater.downloadAndInstall] Error:", exception);
			set({ status: "error", error: String(exception) });
		}
	},
}));
