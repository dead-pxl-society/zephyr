import { invoke } from "@tauri-apps/api/core";
import { emit, listen } from "@tauri-apps/api/event";
import { create } from "zustand";
import type { User } from "@/type";

interface UserStore {
	user: User | null;
	/** True once we know whether a user exists, so the UI can gate on it. */
	loaded: boolean;

	setUser(user: User | null): void;
	updateUser(newUser: Partial<User>): void;
}

export const useUserStore = create<UserStore>((set) => ({
	user: null,
	loaded: false,

	setUser: (user: User | null) => {
		set(() => ({ user, loaded: true }));
	},

	updateUser: (partial: Partial<User>) => {
		set((state) => ({
			user: state.user ? { ...state.user, ...partial } : null,
		}));
	},
}));

export const useUser = () => useUserStore((s) => s.user);

export const useUserLoaded = () => useUserStore((s) => s.loaded);

async function getSingleUser() {
	const { setUser, user } = useUserStore.getState();
	if (user) return;

	try {
		const storedUser = await invoke<User | null>("get_one_user");

		if (storedUser?.language) emit("ui:change_language", storedUser.language);

		setUser(storedUser);
	} catch (exception) {
		console.log("[user.getSingleUser] Error:", JSON.stringify(exception));
		setUser(null);
	}
}

getSingleUser();

listen<Partial<User>>("ui:update_user", (event) => {
	const user = event.payload;
	const { updateUser } = useUserStore.getState();

	updateUser(user);
});
