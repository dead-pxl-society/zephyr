/** biome-ignore-all lint/suspicious/noArrayIndexKey: <> */

import { motion } from "motion/react";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useFamilyDevices } from "@/lib/store/family";
import { useNearbyPeers } from "@/lib/store/peers";
import { cn } from "@/lib/utils";
import type { EphemeralPeer, Peer, PeerInfo } from "@/type";
import { HeroIcon } from "../hero-icon";
import { DataTable } from "../main/table";
import { Button } from "../ui/button";
import { dialogSurface } from "./contact-search";
import { EmptyPeers } from "./empty-peers";
import { PeerCard } from "./peer-card";
import { createShareContactColumns } from "./share-contact-columns";

interface PeerPickerProps {
	parcelId?: number;
	contacts: Peer[];
	animateOnMount?: boolean;
	hasMounted?: boolean;
	fromParcel?: boolean;
	onPush?: (peer: PeerInfo) => void;
	onCancel?: (endpointId: string) => void;
	onSearch: () => void;
	onContactClick: (peer: Peer) => void;
}

const contentVariants = {
	initial: { transform: "translateY(-4px)", filter: "blur(4px)", opacity: 0 },
	visible: (delay: number) => ({
		transform: "translateY(0px)",
		filter: "blur(0px)",
		opacity: 1,
		transition: { delay, bounce: 0, duration: 0.16 },
	}),
	exit: { transform: "translateY(-4px)", filter: "blur(4px)", opacity: 0 },
};

export const PeerPicker = ({
	parcelId,
	contacts,
	animateOnMount = true,
	hasMounted = false,
	fromParcel = false,
	onPush,
	onCancel,
	onSearch,
	onContactClick,
}: PeerPickerProps) => {
	const { t } = useTranslation(["common", "share"]);

	const devices = useFamilyDevices();
	const nearby = useNearbyPeers();

	const peers = useMemo(() => {
		const deviceShortIds = new Set(
			devices.map((d) => d.peer.endpointId.slice(0, 10)),
		);

		const onlineDevices: EphemeralPeer[] = devices
			.filter((d) => d.online)
			.map((d) => ({
				endpointId: d.peer.endpointId,
				ticket: d.peer.ticket,
				peer: d.peer,
			}));

		const filteredNearby = nearby.filter(
			(p) => !deviceShortIds.has(p.endpointId.slice(0, 10)),
		);

		return [...onlineDevices, ...filteredNearby];
	}, [devices, nearby]);

	const contactColumns = useMemo(
		() => createShareContactColumns(parcelId),
		[parcelId],
	);

	const handlePeerSelect = (peer: PeerInfo) => () => {
		if (onPush) onPush(peer);
	};

	const handleCancel = (endpointId: string) => () => {
		if (onCancel) onCancel(endpointId);
	};

	const enter = animateOnMount || hasMounted ? "initial" : false;
	// coming back from parcel there is no shared layout to conflict with, so the
	// whole list enters at once with no delay
	const enterOnce =
		(animateOnMount && !hasMounted) || fromParcel ? "initial" : false;
	const delay = fromParcel ? 0 : 0.14;

	return (
		<div className="space-y-4 py-4">
			<motion.div
				variants={contentVariants}
				custom={delay}
				initial={enter}
				animate="visible"
				exit="exit"
			>
				<div className="mb-2 pl-4">
					<p className="text-muted text-sm">
						{t("share_with", { ns: "share" })}
					</p>
				</div>
				{peers && peers.length > 0 ? (
					<div className="no-scrollbar flex snap-x snap-mandatory gap-4 overflow-x-scroll pr-4">
						<div className="w-px snap-end" />
						{Array.from({ length: Math.ceil(peers.length / 6) }, (_, page) => (
							<ul
								key={`peer-grid-${page}`}
								className={`grid w-[94%] shrink-0 snap-start grid-cols-3 gap-4 [&>li]:w-full ${peers.length <= 3 ? "grid-rows-1" : "grid-rows-2"}`}
							>
								{peers.slice(page * 6, page * 6 + 6).map((peer) => (
									<PeerCard
										key={peer.endpointId}
										ephemeral={peer}
										parcelId={parcelId}
										onClick={handlePeerSelect({
											endpointId: peer.endpointId,
											name: peer.peer?.name,
										})}
										onCancel={handleCancel(peer.endpointId)}
									/>
								))}
							</ul>
						))}
					</div>
				) : (
					<EmptyPeers />
				)}
			</motion.div>
			{contacts.length > 0 && (
				<>
					<div className="mb-2 flex justify-between pl-4">
						<motion.p
							variants={contentVariants}
							custom={delay}
							initial={enter}
							animate="visible"
							exit="exit"
							className="text-muted text-sm"
						>
							{t("peers:contacts")}
						</motion.p>
						<motion.div
							variants={contentVariants}
							custom={delay}
							initial={enterOnce}
							animate="visible"
							exit="exit"
							className="pr-4"
						>
							<motion.div layoutId="search-bar">
								<Button
									variant="ghost"
									className={cn(
										"edge-highlight flex h-7 items-center justify-center gap-x-1 rounded-full bg-background-popup/40 px-2 font-normal backdrop-blur-lg hover:bg-background-popup/40 active:scale-[0.96]",
										dialogSurface,
									)}
									glare
									onClick={onSearch}
								>
									<motion.span layoutId="search-icon">
										<HeroIcon
											name="magnifying-glass"
											className="h-3 w-3 opacity-60"
											iconStyle="micro"
										/>
									</motion.span>
									<motion.span
										layoutId="search-label"
										layout="position"
										className="text-xs"
									>
										{t("common:search")}
									</motion.span>
								</Button>
							</motion.div>
						</motion.div>
					</div>
					<motion.div
						variants={contentVariants}
						custom={delay}
						initial={enterOnce}
						animate="visible"
						exit="exit"
						className="px-4"
					>
						<motion.div layoutId="share-contacts-table" layout="position">
							<DataTable
								columns={contactColumns}
								data={contacts}
								hideHeader
								className={cn(
									"transition-colors group-data-[host=dialog]/picker:hover:bg-background-top",
									dialogSurface,
								)}
								onRowClick={onContactClick}
							/>
						</motion.div>
					</motion.div>
				</>
			)}
		</div>
	);
};
