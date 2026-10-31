import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { create } from "zustand";
import type { Config } from "@/type";

const DEFAULT_CONFIG: Config = {
	clipboardSync: true,
	clipboardFiles: false,
	clipboardMaxBytes: 25 * 1024 * 1024,
};

interface ConfigStore {
	config: Config;

	setConfig(config: Config): void;
}

export const useConfigStore = create<ConfigStore>((set) => ({
	config: DEFAULT_CONFIG,

	setConfig: (config: Config) => {
		set(() => ({ config }));
	},
}));

export const useConfig = () => useConfigStore((s) => s.config);

async function getConfig() {
	const config = await invoke<Config>("get_config");
	useConfigStore.getState().setConfig(config);
}

getConfig();

listen<Config>("config_updated", (event) => {
	useConfigStore.getState().setConfig(event.payload);
});
