import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { create } from "zustand";
import { shallow } from "zustand/shallow";
import { useStoreWithEqualityFn } from "zustand/traditional";
import { queryClient } from "@/lib/store/react-query";
import type {
	DevicePairingEvent,
	DevicePresence,
	FamilyLeft,
	FamilyView,
} from "@/type";

interface FamilyStore {
	family: FamilyView | null;
	presence: Map<string, boolean>;
	setFamily: (family: FamilyView | null) => void;
	setDeviceOnline: (endpointId: string, online: boolean) => void;
}

/**
 * Snapshots compute `online` on the backend when they are built, while
 * presence events report transitions as they happen. A snapshot can be built
 * before a transition and applied after it, so the latest presence seen in
 * this window always wins over whatever a snapshot says.
 */
const overlayPresence = (
	family: FamilyView | null,
	presence: Map<string, boolean>,
): FamilyView | null => {
	if (!family) return null;

	const devices = family.devices.map((device) => {
		const online = presence.get(device.peer.endpointId);
		return online === undefined ? device : { ...device, online };
	});

	return { ...family, devices };
};

export const useFamilyStore = create<FamilyStore>((set) => ({
	family: null,
	presence: new Map(),

	setFamily: (family) =>
		set((state) => ({ family: overlayPresence(family, state.presence) })),

	setDeviceOnline: (endpointId, online) => {
		set((state) => {
			const presence = new Map(state.presence);
			presence.set(endpointId, online);

			return {
				presence,
				family: overlayPresence(state.family, presence),
			};
		});
	},
}));

export async function hydrateFamilyStore() {
	const family = await invoke<FamilyView | null>("get_family");
	useFamilyStore.getState().setFamily(family);
}

export const useFamily = () => useFamilyStore((s) => s.family);

export const useFamilyDevices = () =>
	useStoreWithEqualityFn(
		useFamilyStore,
		(s) => s.family?.devices ?? [],
		shallow,
	);

listen<FamilyView>("family_updated", (event) => {
	useFamilyStore.getState().setFamily(event.payload);
	queryClient.invalidateQueries({ queryKey: ["contacts"] });
});

listen<FamilyLeft>("family_left", () => {
	useFamilyStore.setState({ family: null, presence: new Map() });
	queryClient.invalidateQueries({ queryKey: ["contacts"] });
});

listen<DevicePresence>("device_presence", (event) => {
	const { type, endpointId } = event.payload;
	useFamilyStore.getState().setDeviceOnline(endpointId, type === "online");
});

listen<DevicePairingEvent>("device:pairing", (event) => {
	if (event.payload.type === "completed") hydrateFamilyStore();
});
