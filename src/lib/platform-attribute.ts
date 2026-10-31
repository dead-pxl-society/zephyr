import { platform, version } from "@tauri-apps/plugin-os";

export function setPlatformAttribute(): void {
	const currentPlatform = platform();

	let basePlatform: string;
	let variant: string | null = null;

	if (currentPlatform === "macos") {
		basePlatform = "macos";

		const currentVersion = version();
		const majorVersion = Number.parseInt(currentVersion.split(".")[0], 10);
		if (majorVersion >= 26) {
			variant = "glass";
		}
	} else if (currentPlatform === "windows") {
		basePlatform = "windows";
	} else {
		basePlatform = "linux";
	}

	const root = document.documentElement;
	root.setAttribute("data-platform", basePlatform);

	if (variant) {
		root.setAttribute("data-platform-variant", variant);
	} else {
		root.removeAttribute("data-platform-variant");
	}
}
