import { invoke } from "@tauri-apps/api/core";
import {
	type Event,
	emit,
	listen,
	type UnlistenFn,
} from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { platform } from "@tauri-apps/plugin-os";
import {
	AnimatePresence,
	MotionConfig,
	motion,
	type Variants,
} from "motion/react";
import { useCallback, useEffect, useRef } from "react";
import { Drop } from "@/components/drop";
import { ImportingSection } from "@/components/share/importing-section";
import {
	type ContentStatus,
	ShareSection,
} from "@/components/share/share-section";
import { UnselectedSection } from "@/components/share/unselected-section";
import { useStateRef } from "@/lib/hooks/use-state-ref";
import { useWindowDragDrop } from "@/lib/hooks/use-window-drag-drop";
import { hydrateFamilyStore } from "@/lib/store/family";
import type { Parcel } from "@/lib/store/parcels";
import { hydratePeerStore } from "@/lib/store/peers";
import {
	getOutboundTransfer,
	pushParcelToPeer,
	transferKey,
} from "@/lib/store/transfers";
import { useUser } from "@/lib/store/user";
import type { ImportError, PeerInfo } from "@/type";

type ShareState = "import" | "share" | "unselected";

const avatarVariants: Variants = {
	initial: { filter: "blur(4px)", opacity: 0.75 },
	visible: { filter: "blur(0px)", opacity: 1 },
	exit: { filter: "blur(4px)", opacity: 0.75 },
};

const dragContainerVariants: Variants = {
	initial: { filter: "blur(4px)", opacity: 0, transform: "translateY(-8px)" },
	visible: {
		filter: "blur(0px)",
		opacity: 1,
		transform: "translateY(0px)",
		transitionEnd: { filter: "none" },
	},
	exit: { filter: "blur(4px)", opacity: 0, transform: "translateY(8px)" },
};

export const App = () => {
	const [shareState, setShareState, shareStateRef] =
		useStateRef<ShareState>("unselected");
	const [parcel, setParcel, currentParcel] = useStateRef<Parcel | null>(null);
	const [
		importingParcel,
		setImportingParcel,
		importingParcelRef,
		setImportingParcelRef,
	] = useStateRef<Parcel | null>(null);
	const [contentStatus, setContentStatus, contentStatusRef] =
		useStateRef<ContentStatus>("devices");
	const [importFailed, setImportFailed, importFailedRef] = useStateRef(false);

	const user = useUser();

	const didSetupListeners = useRef(false);
	const unlistenForImportStart = useRef<UnlistenFn>(null);
	const unlistenForTransferReady = useRef<UnlistenFn>(null);
	const unlistenForImportError = useRef<UnlistenFn>(null);

	const currentSizeRef = useRef(0);

	const importFiles = async (files: string[]) => {
		if (shareStateRef.current !== "unselected") return;
		try {
			const parcl = await invoke<Parcel>("import", { files });
			setImportFailed(false);
			setImportingParcel(parcl);
			setShareState("import");
		} catch (exception) {
			console.error("[share] import failed", exception);
			setImportFailed(true);
			setShareState("import");
		}
	};

	const dragging = useWindowDragDrop({ onDrop: importFiles });

	const listenForTransferReady = useCallback(async () => {
		unlistenForTransferReady.current = await listen<Parcel>(
			"share_ready",
			(event: Event<Parcel>) => {
				const par = event.payload;

				if (par.id === importingParcelRef.current?.id) {
					setTimeout(() => {
						setShareState("share");
					}, 200);

					setParcel(par);
				}
			},
		);
	}, []);

	const listenForImportError = useCallback(async () => {
		unlistenForImportError.current = await listen<ImportError>(
			"import_error",
			(event) => {
				const { parcelId, error } = event.payload;
				if (parcelId !== importingParcelRef.current?.id) return;

				console.error("[share] import failed", error);
				setImportFailed(true);
			},
		);
	}, []);

	const listenForImportStart = useCallback(async () => {
		unlistenForImportStart.current = await listen<Parcel>(
			"import_start",
			(event) => {
				// quickly set importing ref to avoid import stuck issues, setting it only on setImportingParcel causes a race condition on small files.
				setImportingParcelRef(event.payload);

				setImportFailed(false);
				setImportingParcel(event.payload);
				setShareState("import");
			},
		);
	}, []);

	const handleDone = useCallback(async () => {
		try {
			await invoke("hide_window");

			setShareState("unselected");
			setContentStatus("devices");
			setImportFailed(false);
			currentSizeRef.current = 0;
		} catch (_) {
			// ignore
		}
	}, []);

	const handlePush = async (peer: PeerInfo) => {
		if (!currentParcel.current) return;
		await pushParcelToPeer(currentParcel.current, peer);
	};

	const handleCancel = async (endpointId: string) => {
		const pid = currentParcel.current?.id;
		if (pid == null) return;
		const key = transferKey(pid, endpointId);
		const outbound = getOutboundTransfer(key);
		if (!outbound) return;

		try {
			await invoke("cancel_share_request", { requestId: outbound.requestId });
		} catch (_e) {
			// ignore
		}
	};

	const renderContent = () => {
		if (shareState === "unselected")
			return (
				<UnselectedSection
					avatarVariants={avatarVariants}
					onClose={handleDone}
				/>
			);

		if (shareState === "import")
			return (
				<ImportingSection
					avatarVariants={avatarVariants}
					parcelId={importingParcel?.id}
					files={importingParcel?.totalFiles || 1}
					failed={importFailed}
				/>
			);

		return (
			<ShareSection
				avatarVariants={avatarVariants}
				avatarSeed={user?.endpointId}
				parcel={parcel}
				contentStatus={contentStatus}
				onContentStatusChange={setContentStatus}
				onDone={handleDone}
				onPush={handlePush}
				onCancel={handleCancel}
			/>
		);
	};

	useEffect(() => {
		if (!didSetupListeners.current) {
			didSetupListeners.current = true;

			listenForImportStart();
			listenForTransferReady();
			listenForImportError();
		}

		return () => {
			if (unlistenForImportStart.current) {
				unlistenForImportStart.current();
				unlistenForImportStart.current = null;
			}

			if (unlistenForImportError.current) {
				unlistenForImportError.current();
				unlistenForImportError.current = null;
			}

			if (unlistenForTransferReady.current) {
				unlistenForTransferReady.current();
				unlistenForTransferReady.current = null;
			}
		};
	}, []);

	// The window lives hidden between shares, so every time it comes back the
	// peer lists are refetched rather than trusted from the last session.
	useEffect(() => {
		const hydrate = () => {
			hydratePeerStore().catch((e) => console.error("[share] peers", e));
			hydrateFamilyStore().catch((e) => console.error("[share] family", e));
		};

		hydrate();

		const unlisten = getCurrentWindow().onFocusChanged(
			({ payload: focused }) => {
				if (focused) hydrate();
			},
		);

		return () => {
			unlisten.then((fn) => fn());
		};
	}, []);

	useEffect(() => {
		const isMac = platform() === "macos";

		const handleGlobalKeyDown = async (event: KeyboardEvent) => {
			const modifier = isMac ? event.metaKey : event.ctrlKey;
			if (modifier && event.key === ",") {
				event.preventDefault();
				await invoke("show_main_window");
				await emit("open-settings");
				return;
			}

			if (event.key !== "Escape" || dragging) return;

			if (shareStateRef.current === "import") {
				if (importFailedRef.current) {
					setImportFailed(false);
					setShareState("unselected");
				}
				return;
			}
			if (
				shareStateRef.current === "share" &&
				contentStatusRef.current !== "devices"
			) {
				setContentStatus("devices");
				return;
			}

			handleDone();
		};

		window.addEventListener("keydown", handleGlobalKeyDown);
		return () => {
			window.removeEventListener("keydown", handleGlobalKeyDown);
		};
	}, [handleDone, dragging]);

	return (
		<main className="h-full w-full macos-glass:rounded-3xl macos-glass:bg-background/70 macos-glass:backdrop-blur-xl">
			<div
				data-tauri-drag-region
				className="absolute top-0 right-0 left-0 z-20 h-4"
			/>
			<AnimatePresence mode="popLayout" initial={false}>
				{dragging && shareState === "unselected" ? (
					<motion.div
						key="dragging"
						className="h-full w-full"
						variants={dragContainerVariants}
						initial="initial"
						animate="visible"
						exit="exit"
						transition={{ duration: 0.14, bounce: 0 }}
					>
						<Drop />
					</motion.div>
				) : (
					<motion.div
						key="sharecontent"
						className="h-full w-full"
						variants={dragContainerVariants}
						initial="initial"
						animate="visible"
						exit="exit"
						transition={{ duration: 0.14, bounce: 0 }}
					>
						<MotionConfig
							transition={{ type: "spring", duration: 0.4, bounce: 0 }}
						>
							{renderContent()}
						</MotionConfig>
					</motion.div>
				)}
			</AnimatePresence>
		</main>
	);
};
