import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { useSetAtom } from "jotai";
import { AnimatePresence, motion, type Variants } from "motion/react";
import {
	type ForwardedRef,
	forwardRef,
	useCallback,
	useEffect,
	useImperativeHandle,
	useRef,
	useState,
} from "react";
import { toast } from "sonner";
import type { ContentStatus } from "@/components/share/share-content";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { errorMessage } from "@/lib/errors";
import { usePrevious } from "@/lib/hooks/use-previous";
import { useStateRef } from "@/lib/hooks/use-state-ref";
import { shareDialogAtom } from "@/lib/store/jotai";
import type { Parcel } from "@/lib/store/parcels";
import {
	getOutboundTransfer,
	pushParcelToPeer,
	transferKey,
} from "@/lib/store/transfers";
import type { ImportError, Peer, PeerInfo, ShareDialogProps } from "@/type";
import { ImportSection } from "./import";
import { SelectSection } from "./select";
import { ShareSection } from "./share";
import { ShareSingleSection } from "./share-single";

export type ShareState = "import" | "share" | "select";

export interface ShareDialogHandle {
	present: () => void;
	dismiss: () => void;
	setShareState: (newState: ShareState) => void;
}

export const ShareDialog = forwardRef(
	(
		{
			peer,
			parcel: initialParcel,
			importingParcel: initialImportingParcel,
			onClose,
		}: ShareDialogProps,
		ref: ForwardedRef<ShareDialogHandle>,
	) => {
		const [open, setOpen] = useState(false);
		const [importingFiles, setImportingFiles] = useState<number>(0);
		const [connecting, setConnecting] = useState(false);

		const [importingParcelId, setImportingParcelId, importingParcelIdRef] =
			useStateRef<number | null>(null);
		const [shareState, setShareState] = useStateRef<ShareState>(
			initialParcel && !peer ? "share" : "select",
		);
		const [parcel, setParcel, parcelRef] = useStateRef<Parcel | null>(null);
		const [contentStatus, setContentStatus] =
			useState<ContentStatus>("devices");

		const setShareDialogData = useSetAtom(shareDialogAtom);

		const initialPeerRef = useRef<Peer>(null);
		const didSetupListenersRef = useRef(false);
		const unlistenForShareReady = useRef<UnlistenFn>(null);
		const unlistenForImportError = useRef<UnlistenFn>(null);
		const pendingShareReadyRef = useRef<Parcel | null>(null);
		const previousShareState = usePrevious<ShareState>(shareState);

		const present = () => setOpen(true);
		const dismiss = () => {
			setOpen(false);
			if (onClose) onClose();
			clearState();
		};

		const handleOpenChange = (newOpen: boolean) => {
			setOpen(newOpen);

			if (!newOpen) clearState();

			if (!newOpen && onClose) {
				onClose();
			}
		};

		const clearState = () => {
			setTimeout(() => {
				setImportingParcelId(null);
				setImportingFiles(0);
				setShareState("select");
				setContentStatus("devices");
				setShareDialogData({ visible: false, data: undefined });
				initialPeerRef.current = null;
				pendingShareReadyRef.current = null;
			}, 200);
		};

		const onPush = async (pushParcel: Parcel, peer: PeerInfo) => {
			setConnecting(true);
			try {
				return await pushParcelToPeer(pushParcel, peer);
			} finally {
				setConnecting(false);
			}
		};

		const onCancel = async (endpointId: string) => {
			const pid = parcelRef.current?.id;
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

		const onSelectParcel = async (parcel: Parcel) => {
			if (initialPeerRef.current) {
				const peerInfo: PeerInfo = {
					endpointId: initialPeerRef.current.endpointId,
					name: initialPeerRef.current.name,
				};

				const sent = await onPush(parcel, peerInfo);
				if (!sent) return;
			}

			setParcel(parcel);
			setShareState("share");
		};

		const startImport = (parcelId: number, totalFiles: number) => {
			setImportingParcelId(parcelId);
			setImportingFiles(totalFiles);
		};

		const onImport = (parcelId: number, totalFiles: number) => {
			startImport(parcelId, totalFiles);
			setShareState("import");
		};

		const onShareBack = () => {
			setShareState("select");
			setContentStatus("devices");
		};

		const completeImport = useCallback(async (completeParcel: Parcel) => {
			if (initialPeerRef.current) {
				const peerInfo: PeerInfo = {
					endpointId: initialPeerRef.current.endpointId,
					name: initialPeerRef.current.name,
				};

				const sent = await onPush(completeParcel, peerInfo);
				if (!sent) {
					setShareState("select");
					return;
				}
			}

			setParcel(completeParcel);
			setShareState("share");
		}, []);

		const listenForShareReady = useCallback(async () => {
			unlistenForShareReady.current = await listen<Parcel>(
				"share_ready",
				async (event) => {
					const completeParcel = event.payload;

					if (completeParcel.id !== importingParcelIdRef.current) {
						pendingShareReadyRef.current = completeParcel;
						return;
					}

					await completeImport(completeParcel);
				},
			);
		}, [completeImport]);

		const listenForImportError = useCallback(async () => {
			unlistenForImportError.current = await listen<ImportError>(
				"import_error",
				(event) => {
					const { parcelId, error } = event.payload;
					if (parcelId !== importingParcelIdRef.current) return;

					setImportingParcelId(null);
					setImportingFiles(0);
					setShareState("select");
					toast.error(errorMessage(error, "errors:import_failed"));
				},
			);
		}, []);

		const renderContent = () => {
			if (shareState === "share")
				return peer ? (
					<ShareSingleSection
						peer={peer}
						parcel={parcel}
						onDone={dismiss}
						onCancel={onCancel}
						onNavBack={onShareBack}
					/>
				) : (
					<ShareSection
						parcel={parcel}
						contentStatus={contentStatus}
						onContentStatusChange={setContentStatus}
						onDone={dismiss}
						onPush={onPush}
						onCancel={onCancel}
						onNavBack={onShareBack}
					/>
				);
			if (shareState === "import")
				return (
					<ImportSection
						parcelId={importingParcelId}
						files={importingFiles}
						connecting={connecting}
					/>
				);
			return (
				<SelectSection
					connecting={connecting}
					onDone={dismiss}
					onImport={onImport}
					onSelectParcel={onSelectParcel}
				/>
			);
		};

		useImperativeHandle(ref, () => ({ present, dismiss, setShareState }));

		const onEscapeKeyDown = (event: KeyboardEvent) => {
			if (shareState === "import") {
				event.preventDefault();
				return;
			}

			if (shareState === "share" && contentStatus === "search") {
				event.preventDefault();
				setContentStatus("devices");
			}
		};

		useEffect(() => {
			if (!didSetupListenersRef.current) {
				didSetupListenersRef.current = true;
				listenForShareReady();
				listenForImportError();
			}

			return () => {
				if (unlistenForShareReady.current) {
					unlistenForShareReady.current();
					unlistenForShareReady.current = null;
				}

				if (unlistenForImportError.current) {
					unlistenForImportError.current();
					unlistenForImportError.current = null;
				}
			};
		}, [listenForShareReady, listenForImportError]);

		useEffect(() => {
			if (initialParcel && !parcelRef.current) setParcel(initialParcel);
		}, [initialParcel]);

		useEffect(() => {
			if (peer) initialPeerRef.current = peer;
		}, [peer]);

		useEffect(() => {
			if (!initialImportingParcel) return;

			startImport(
				initialImportingParcel.id,
				initialImportingParcel.totalFiles || 0,
			);
		}, [initialImportingParcel]);

		// Recovers a "share_ready" that arrived before its parcel id was recorded,
		// or before the parent flipped us into the import state.
		useEffect(() => {
			if (shareState !== "import" || importingParcelId === null) return;

			const pending = pendingShareReadyRef.current;
			if (pending?.id !== importingParcelId) return;

			pendingShareReadyRef.current = null;
			completeImport(pending);
		}, [shareState, importingParcelId, completeImport]);

		return (
			<Dialog open={open} onOpenChange={handleOpenChange}>
				<DialogContent
					className="top-[calc(-0.01px+8vh)] left-[calc(50%+112px)] flex h-[32rem] w-[28rem] translate-y-0 flex-col gap-0 overflow-hidden rounded-xl border-border bg-background-top p-0"
					showCloseButton={false}
					onEscapeKeyDown={onEscapeKeyDown}
				>
					<AnimatePresence initial={false} mode="popLayout">
						<motion.div
							className="h-full w-full"
							variants={variants}
							custom={{ from: previousShareState, to: shareState }}
							initial="initial"
							animate="animate"
							exit="exit"
							key={shareState}
							transition={{ duration: 0.175, ease: "easeInOut" }}
						>
							{renderContent()}
						</motion.div>
					</AnimatePresence>
				</DialogContent>
			</Dialog>
		);
	},
);

const variants: Variants = {
	initial: ({ to, from }: ContentVariantCustom) => {
		if (to === "import" || from === "import")
			return {
				opacity: 0,
				filter: "blur(4px)",
			};

		return {
			opacity: 0,
			filter: "blur(4px)",
			transform:
				to === "select" && from === "share"
					? "translateX(-200px)"
					: "translateX(200px)",
		};
	},
	animate: {
		opacity: 1,
		filter: "blur(0)",
		transform: "translateX(0)",
	},
	// To and from values flip here
	exit: ({ to, from }: ContentVariantCustom) => {
		if (to === "import" || from === "import")
			return {
				opacity: 0,
				filter: "blur(4px)",
			};

		return {
			opacity: 0,
			filter: "blur(4px)",
			transform:
				(to === "select" && from === "share") ||
				(to === "select" && from === "select")
					? "translateX(-200px)"
					: "translateX(200px)",
		};
	},
};

type ContentVariantCustom = {
	to: ShareState;
	from: ShareState;
};
