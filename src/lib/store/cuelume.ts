import { listen } from "@tauri-apps/api/event";
import { bind, play, type SoundName, setEnabled, setVolume } from "cuelume";
import { useUserStore } from "./user";

bind();
setVolume(1);

const applySoundSetting = (sounds?: boolean) => setEnabled(sounds ?? true);

applySoundSetting(useUserStore.getState().user?.sounds);
useUserStore.subscribe((state) => applySoundSetting(state.user?.sounds));

listen<SoundName>("sound:play", (event) => {
	const sound = event.payload;
	play(sound);
});
