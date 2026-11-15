import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import {
	type ForwardedRef,
	forwardRef,
	useEffect,
	useImperativeHandle,
	useRef,
	useState,
} from "react";

import { useStateRef } from "@/lib/hooks/use-state-ref";
import type { DevicePairingEvent, PairingRejectReason } from "@/type";
import { DynamicDrawer, type DynamicDrawerHandles } from "../dynamic-drawer";
import { AcceptedSection } from "./accepted";
import { ErrorSection } from "./error";
import { ShowCode } from "./show-code";
import { SuccessSection } from "./success";

export interface DeviceInviteHandles {
	present: (sessionId: number) => void;
	dismiss: () => void;
}

export interface DeviceInviteDialogProps {
	fullscreen?: boolean;
	onClose?: () => void;
}

type DeviceInviteStatus = "showCode" | "accepted" | "success" | "error";

export const DeviceInviteDrawer = forwardRef(
	(
		{ fullscreen, onClose }: DeviceInviteDialogProps,
		ref: ForwardedRef<DeviceInviteHandles>,
	) => {
		const [status, setStatus, statusRef] =
			useStateRef<DeviceInviteStatus>("showCode");
		const sessionIdRef = useRef<number | null>(null);
		const [code, setCode] = useState("");
		const [rejectReason, setRejectReason] =
			useState<PairingRejectReason | null>(null);

		const drawerRef = useRef<DynamicDrawerHandles>(null);
		const pendingEventRef = useRef<DevicePairingEvent | null>(null);

		const dismiss = () => {
			drawerRef.current?.dismiss();
		};

		const applyEvent = (payload: DevicePairingEvent) => {
			if (
				payload.type === "completed" ||
				payload.type === "rejected" ||
				payload.type === "failed"
			)
				setTimeout(() => {
					dismiss();
				}, 1600);

			switch (payload.type) {
				case "code":
					setCode(payload.code);
					break;
				case "completed":
					setStatus("success");
					break;
				case "rejected":
					setRejectReason(payload.reason);
					setStatus("error");
					break;
				case "failed":
					setStatus("error");
					break;
				case "cancelled":
					dismiss();
					break;
			}
		};

		const reset = () => {
			sessionIdRef.current = null;
			setCode("");
			setRejectReason(null);
			setStatus("showCode");
		};

		// Pairing events can beat `pair_device` resolving, which is when the
		// session id becomes known; anything that arrives early is replayed here.
		const present = (newSessionId: number) => {
			reset();
			sessionIdRef.current = newSessionId;
			drawerRef.current?.present();

			const pending = pendingEventRef.current;
			pendingEventRef.current = null;
			if (pending?.sessionId === newSessionId) applyEvent(pending);
		};

		const handleClosed = () => {
			reset();
			onClose?.();
		};

		const cancelPairing = async () => {
			if (statusRef.current !== "showCode") return;

			try {
				await invoke("cancel_pairing", { sessionId: sessionIdRef.current });
			} catch (e) {
				console.error("[pairing] cancel failed", e);
			}
		};

		const onCancel = () => {
			cancelPairing();
			dismiss();
		};

		const applyEventRef = useRef(applyEvent);
		applyEventRef.current = applyEvent;

		const renderContent = () => {
			if (status === "showCode")
				return <ShowCode code={code} onCancel={onCancel} />;
			if (status === "accepted") return <AcceptedSection />;
			if (status === "success") return <SuccessSection />;
			return <ErrorSection reason={rejectReason} />;
		};

		useImperativeHandle(ref, () => ({ present, dismiss }));

		useEffect(() => {
			let unlisten: UnlistenFn | null = null;
			let cancelled = false;

			listen<DevicePairingEvent>("device:pairing", (event) => {
				const payload = event.payload;

				if (payload.sessionId !== sessionIdRef.current) {
					pendingEventRef.current = payload;
					return;
				}

				applyEventRef.current(payload);
			}).then((fn) => {
				if (cancelled) {
					fn();
				} else {
					unlisten = fn;
				}
			});

			return () => {
				cancelled = true;
				unlisten?.();
			};
		}, []);

		return (
			<DynamicDrawer
				ref={drawerRef}
				viewKey={status}
				fullscreen={fullscreen}
				onClosed={handleClosed}
				hideClose
				preventClose={status !== "showCode"}
			>
				{renderContent()}
			</DynamicDrawer>
		);
	},
);
