import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
	DynamicDrawer,
	type DynamicDrawerHandles,
} from "@/components/main/dynamic-drawer";
import { DeviceRequestDecision } from "@/components/main/requests/device-request/decision";
import { DeviceRequestForm } from "@/components/main/requests/device-request/form";
import { useDeviceRequest } from "@/components/main/requests/device-request/use-device-request";
import {
	useNextDeviceRequest,
	useShareRequestStore,
} from "@/lib/store/requests";
import type { DeviceRequest } from "@/type";

export const DeviceRequestDrawer = () => {
	const nextRequest = useNextDeviceRequest();
	const removeRequest = useShareRequestStore((s) => s.removeRequest);

	const [request, setRequest] = useState<DeviceRequest | null>(null);
	const answeredRef = useRef(false);
	const drawerRef = useRef<DynamicDrawerHandles>(null);

	const pending = useShareRequestStore((s) =>
		request
			? s.requests.some(
					(r) => r.type === "device" && r.sessionId === request.sessionId,
				)
			: false,
	);

	const { status, join, reject, accept, cleanup } = useDeviceRequest({
		request,
		onAnswerRequest: () => {
			answeredRef.current = true;
			if (request) removeRequest(request.sessionId, "device");
			drawerRef.current?.dismiss();
		},
	});

	const { t } = useTranslation();

	useEffect(() => {
		if (request || !nextRequest) return;

		answeredRef.current = false;
		setRequest(nextRequest);
		drawerRef.current?.present();
	}, [request, nextRequest]);

	useEffect(() => {
		if (!request || pending || answeredRef.current) return;

		answeredRef.current = true;
		drawerRef.current?.dismiss();
	}, [request, pending]);

	const onClosed = () => {
		if (!answeredRef.current) reject();

		cleanup();
		setRequest(null);
	};

	const peerName = request?.peer.name
		? request.peer.name
		: t("peers:peer_default_name", {
				id: request?.peer.endpointId.slice(-4),
			});

	return (
		<DynamicDrawer
			ref={drawerRef}
			viewKey={status}
			fullscreen // This runs in onboarding only for now if that changes implement this properly
			onClosed={onClosed}
			hideClose
		>
			{status === "join" ? (
				<DeviceRequestDecision
					endpointId={request?.peer.endpointId}
					peerName={peerName}
					onReject={reject}
					onAccept={join}
				/>
			) : (
				<DeviceRequestForm
					code={request?.code}
					endpointId={request?.peer.endpointId}
					onSubmit={accept}
					onReject={reject}
				/>
			)}
		</DynamicDrawer>
	);
};
