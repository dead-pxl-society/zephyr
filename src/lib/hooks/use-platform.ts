import { platform, version } from "@tauri-apps/plugin-os";

export const usePlatform = (basic: boolean = false) => {
	const currentPlatform = platform();

	let dataPlatform: string;
	if (currentPlatform === "macos") {
		if (basic) return "macos";
		const currentVersion = version();
		const majorVersion = Number.parseInt(currentVersion.split(".")[0], 10);
		dataPlatform = majorVersion >= 26 ? "macos-glass" : "macos";
	} else if (currentPlatform === "windows") {
		dataPlatform = "windows";
	} else {
		// We don't use mobile so for now we merge all bsd and solaris into linux
		dataPlatform = "linux";
	}

	return dataPlatform;
};
