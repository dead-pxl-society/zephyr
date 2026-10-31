import { listen } from "@tauri-apps/api/event";
import dayjs from "dayjs";
import { create } from "zustand";
import { shallow } from "zustand/shallow";
import { useStoreWithEqualityFn } from "zustand/traditional";
import type {
	ImportError as ImportErrorEvent,
	ImportProgress as ImportProgressEvent,
} from "@/type";

export interface ParcelFile {
	path: string;
	mime: string;
}

export interface Parcel {
	id: number;
	files?: ParcelFile[];
	totalFiles?: number;
	size?: number;
	ticket?: string;
	hash?: string;
	date?: string;
}

interface ParcelStore {
	parcels: Record<number, Parcel>;
	importProgress: Record<number, number>;

	upsertParcel(parcel: Partial<Parcel>): void;
	deleteParcel(id: number): void;
	deleteAllParcels(): void;

	updateImportProgress(id: number, progress: number): void;
	deleteImportProgress(id: number): void;
	incrementSize(id: number, size: number): void;
}

export const useParcelStore = create<ParcelStore>((set) => ({
	parcels: {},
	importProgress: {},

	upsertParcel: (parcel: Partial<Parcel>) => {
		if (parcel.id === null || parcel.id === undefined) return;
		const id = parcel.id || 0;

		set((state) => {
			const existing = state.parcels[id] || { date: dayjs().format() };
			return {
				parcels: {
					...state.parcels,
					[id]: {
						...existing,
						...parcel,
					},
				},
			};
		});
	},

	deleteParcel: (id: number) => {
		set((state) => {
			const { [id]: _, ...rest } = state.parcels;
			return { parcels: rest };
		});
	},

	deleteAllParcels: () => {
		set(() => ({ parcels: {} }));
	},

	updateImportProgress: (id: number, progress: number) => {
		set((state) => ({
			importProgress: { ...state.importProgress, [id]: progress },
		}));
	},

	deleteImportProgress: (id: number) => {
		set((state) => {
			const { [id]: _, ...rest } = state.importProgress;

			return { importProgress: rest };
		});
	},

	incrementSize: (id: number, size: number) => {
		set((state) => {
			const existing = state.parcels[id];
			if (!existing) return state;

			return {
				parcels: {
					...state.parcels,
					[id]: {
						...existing,
						size: (existing.size ?? 0) + size,
					},
				},
			};
		});
	},
}));

export const useParcels = () =>
	useStoreWithEqualityFn(
		useParcelStore,
		(s) => Object.values(s.parcels).sort((a, b) => b.id - a.id),
		shallow,
	);

export const useRecentParcels = (limit: number) =>
	useStoreWithEqualityFn(
		useParcelStore,
		(state) =>
			Object.values(state.parcels)
				.sort((a, b) => b.id - a.id)
				.slice(0, limit),
		shallow,
	);

export const useParcelByTicket = (ticket?: string) =>
	useStoreWithEqualityFn(
		useParcelStore,
		(state) => {
			if (!ticket) return undefined;
			return Object.values(state.parcels).find(
				(parcel) => parcel.ticket === ticket,
			);
		},
		shallow,
	);

export const useImportProgress = (id: number | undefined) =>
	useParcelStore((s) => (id !== undefined ? (s.importProgress[id] ?? 0) : 0));

const fileProgress = new Map<string, number>();
const dirtyParcels = new Set<number>();
let frameScheduled = false;

const flushProgressFrame = () => {
	frameScheduled = false;

	const { parcels, updateImportProgress } = useParcelStore.getState();

	for (const parcelId of dirtyParcels) {
		const totalSize = parcels[parcelId]?.size;
		if (!totalSize) continue;

		let totalProgress = 0;
		const prefix = `${parcelId}:`;
		for (const [key, bytes] of fileProgress) {
			if (key.startsWith(prefix)) {
				totalProgress += bytes;
			}
		}

		updateImportProgress(parcelId, Math.min(totalProgress / totalSize, 1));
		dirtyParcels.delete(parcelId);
	}

	if (dirtyParcels.size > 0 && !frameScheduled) {
		frameScheduled = true;
		requestAnimationFrame(flushProgressFrame);
	}
};

const scheduleProgress = (
	parcelId: number,
	fileKey: string,
	progress: number,
) => {
	fileProgress.set(`${parcelId}:${fileKey}`, progress);
	dirtyParcels.add(parcelId);

	if (!frameScheduled) {
		frameScheduled = true;
		requestAnimationFrame(flushProgressFrame);
	}
};

listen<Parcel>("parcel", (event) => {
	const parcel = event.payload;
	const { parcels, upsertParcel, deleteParcel } = useParcelStore.getState();

	if (parcel.hash) {
		const duplicate = Object.values(parcels).find(
			(p) => p.hash === parcel.hash && p.id !== parcel.id,
		);

		if (duplicate && parcel.id !== undefined) {
			deleteParcel(parcel.id);
			return;
		}
	}
	upsertParcel(parcel);
});

listen<number>("ui:delete_parcel", (event) => {
	const id = event.payload;
	const { deleteParcel } = useParcelStore.getState();

	deleteParcel(id);
});

listen("ui:delete_all_parcels", () => {
	const { deleteAllParcels } = useParcelStore.getState();
	deleteAllParcels();
});

listen<ImportProgressEvent>("import_progress", (event) => {
	const { type, size, progress, parcelId, key } = event.payload;
	const { incrementSize } = useParcelStore.getState();

	if (type === "size") incrementSize(parcelId, size || 0);
	else if (type === "outboardProgress" && progress !== undefined)
		scheduleProgress(parcelId, key, progress);
});

const clearFileProgress = (parcelId: number) => {
	dirtyParcels.delete(parcelId);

	const prefix = `${parcelId}:`;
	for (const key of fileProgress.keys()) {
		if (key.startsWith(prefix)) {
			fileProgress.delete(key);
		}
	}
};

listen<Parcel>("share_ready", (event) => {
	const parcel = event.payload;
	const { deleteImportProgress, updateImportProgress } =
		useParcelStore.getState();

	clearFileProgress(parcel.id);
	updateImportProgress(parcel.id, 1);

	setTimeout(() => {
		deleteImportProgress(parcel.id);
	}, 200);
});

listen<ImportErrorEvent>("import_error", (event) => {
	const { parcelId } = event.payload;
	const { deleteImportProgress, deleteParcel } = useParcelStore.getState();

	clearFileProgress(parcelId);
	deleteImportProgress(parcelId);
	deleteParcel(parcelId);
});

listen("sys_menu:deleted_parcels", () => {
	const { deleteAllParcels } = useParcelStore.getState();
	deleteAllParcels();
});
