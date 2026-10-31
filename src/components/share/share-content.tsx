import { useQuery } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";
import { AnimatePresence, MotionConfig, type Transition } from "motion/react";
import { useEffect, useRef } from "react";
import type { Parcel } from "@/lib/store/parcels";
import { getOutboundTransfer, transferKey } from "@/lib/store/transfers";
import { cn } from "@/lib/utils";
import type { Peer, PeerInfo } from "@/type";
import { ContactSearch } from "./contact-search";
import { ParcelManager } from "./parcel-manager";
import { PeerPicker } from "./peer-picker";

export type ContentStatus = "devices" | "search" | "parcel";

interface ShareContentProps {
	parcel?: Parcel | null;
	contentStatus: ContentStatus;
	className?: string;
	host?: "window" | "dialog";
	animateOnMount?: boolean;
	onPush?: (peer: PeerInfo) => void;
	onCancel?: (endpointId: string) => void;
	onContentStatusChange: (status: ContentStatus) => void;
}

const CONTACT_LIMIT = 10;

// trusted first across the whole contact set, without touching the rust sort
const fetchShareContacts = async (): Promise<Peer[]> => {
	const trusted = await invoke<Peer[]>("get_peers", {
		pagination: {
			limit: CONTACT_LIMIT,
			kind: "contact",
			trust_level: "trusted",
		},
	});
	if (trusted.length >= CONTACT_LIMIT) return trusted;

	const untrusted = await invoke<Peer[]>("get_peers", {
		pagination: {
			limit: CONTACT_LIMIT - trusted.length,
			kind: "contact",
			trust_level: "untrusted",
		},
	});
	return [...trusted, ...untrusted];
};

const transition: Transition = {
	type: "spring",
	duration: 0.4,
	bounce: 0,
};

export const ShareContent = ({
	parcel,
	contentStatus,
	className,
	host = "window",
	animateOnMount = true,
	onPush,
	onCancel,
	onContentStatusChange,
}: ShareContentProps) => {
	const hasMountedRef = useRef(false);
	const prevStatusRef = useRef(contentStatus);
	const cameFromRef = useRef(contentStatus);

	if (prevStatusRef.current !== contentStatus) {
		cameFromRef.current = prevStatusRef.current;
		prevStatusRef.current = contentStatus;
	}

	const { data: contacts = [] } = useQuery({
		queryKey: ["contacts", "share"],
		queryFn: fetchShareContacts,
	});

	const handleBack = () => onContentStatusChange("devices");

	const handleContactClick = (peer: Peer) => {
		const status =
			parcel?.id != null
				? getOutboundTransfer(transferKey(parcel.id, peer.endpointId))
						?.status || "idle"
				: "idle";

		if (status === "importing" || status === "transfering" || status === "done")
			return;

		if (status === "requested") {
			if (onCancel) onCancel(peer.endpointId);
			return;
		}

		if (onPush) onPush({ endpointId: peer.endpointId, name: peer.name });
	};

	useEffect(() => {
		hasMountedRef.current = true;
	}, []);

	const renderContent = () => {
		if (contentStatus === "search")
			return (
				<ContactSearch
					parcelId={parcel?.id}
					loadedContacts={contacts}
					onBack={handleBack}
					onContactClick={handleContactClick}
				/>
			);

		if (contentStatus === "parcel")
			return <ParcelManager parcel={parcel} onBack={handleBack} />;

		return (
			<PeerPicker
				parcelId={parcel?.id}
				contacts={contacts}
				animateOnMount={animateOnMount}
				hasMounted={hasMountedRef.current}
				fromParcel={cameFromRef.current === "parcel"}
				onPush={onPush}
				onCancel={onCancel}
				onSearch={() => onContentStatusChange("search")}
				onContactClick={handleContactClick}
			/>
		);
	};

	return (
		<MotionConfig transition={transition}>
			<div data-host={host} className={cn("overflow-y-scroll", className)}>
				<AnimatePresence mode="popLayout">{renderContent()}</AnimatePresence>
			</div>
		</MotionConfig>
	);
};
