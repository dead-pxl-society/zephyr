import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";
import { useSetAtom } from "jotai";
import {
	AnimatePresence,
	motion,
	type Transition,
	type Variants,
} from "motion/react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { useOnClickOutside } from "usehooks-ts";
import { HeroIcon } from "@/components/hero-icon";
import { HolographicEmpty } from "@/components/holographic-empty";
import { createColumns } from "@/components/main/contact-columns";
import { createDeviceColumns } from "@/components/main/device-columns";
import {
	DeviceInviteDrawer,
	type DeviceInviteHandles,
} from "@/components/main/device-invite-drawer";
import { PeerWideCard } from "@/components/main/peer-wide-card";
import { DataTable } from "@/components/main/table";
import { RefreshDiscoveryButton } from "@/components/refresh-discovery-button";
import { Button } from "@/components/ui/button";
import { toastError } from "@/lib/errors";
import { hydrateFamilyStore, useFamilyDevices } from "@/lib/store/family";
import { shareDialogAtom } from "@/lib/store/jotai";
import {
	hydratePeerStore,
	useNearbyPeers,
	usePeerStore,
} from "@/lib/store/peers";
import { queryClient } from "@/lib/store/react-query";
import type { DeviceView, EphemeralPeer, Peer, TrustLevel } from "@/type";

const LIMIT = 10;

const variants: Variants = {
	initial: { opacity: 0, filter: "blur(4px)" },
	animate: { opacity: 1, filter: "blur(0px)" },
	exit: { opacity: 0, filter: "blur(4px)" },
};

const transition: Transition = {
	duration: 0.2,
	bounce: 0,
};

const makePeerFromEphemeral = (ephemeral: EphemeralPeer): Peer => {
	const innerPeer: Partial<Peer> = ephemeral.peer || {};
	const peer: Peer = {
		...innerPeer,
		id: innerPeer.id || "",
		endpointId: innerPeer.endpointId || ephemeral.endpointId,
		ticket: innerPeer.ticket || ephemeral.ticket || "",
		trustLevel: "untrusted",
		kind: "stranger",
	};

	return peer;
};

const fetchContacts = async (page: number) => {
	const offset = page * LIMIT;
	const contacts: Peer[] = await invoke("get_peers", {
		pagination: { offset, limit: LIMIT, kind: "contact" },
	});

	return contacts;
};

export const PeersPage = () => {
	const [page, setPage] = useState(0);
	const [selectedPeer, setSelectedPeer] = useState<string | null>(null);
	const [nearbyExpanded, setNearbyExpanded] = useState(false);

	const setShareDialogData = useSetAtom(shareDialogAtom);

	const nearbyPeers = useNearbyPeers();
	const devices = useFamilyDevices();
	const peerRef = useRef(null);
	const deviceDrawerRef = useRef<DeviceInviteHandles>(null);

	const { data: contacts } = useQuery({
		queryKey: ["contacts", "list", page],
		queryFn: () => fetchContacts(page),
		placeholderData: keepPreviousData,
	});

	const { data: contactCount = 0 } = useQuery({
		queryKey: ["contacts", "count"],
		queryFn: () =>
			invoke<number>("get_peer_count", { pagination: { kind: "contact" } }),
	});
	const pages = contactCount > 0 ? Math.ceil(contactCount / LIMIT) : 1;

	const { t } = useTranslation(["peers", "common"]);

	const toggleExpanded = () => setNearbyExpanded((prev) => !prev);

	const handleSelect = (peer: Partial<Peer>) => {
		setSelectedPeer((prev) => {
			if (prev) return null;

			return peer.endpointId || null;
		});
	};

	const handleSendFiles = (ephemeral: EphemeralPeer) => () => {
		const peer = makePeerFromEphemeral(ephemeral);
		setShareDialogData({ visible: true, data: { peer } });
		setSelectedPeer(null);
	};

	const handleClickOutside = () => {
		if (peerRef.current === null) return;
		setSelectedPeer(null);
		peerRef.current = null;
	};

	const onSend = (peer: Peer) => {
		setShareDialogData({ visible: true, data: { peer } });
	};

	const onAddToPersonal = async (peer: Peer) => {
		try {
			const sessionId = await invoke<number>("pair_device", {
				endpointId: peer.endpointId,
			});
			deviceDrawerRef.current?.present(sessionId);
		} catch (e) {
			toastError(e, "errors:error_pairing_device");
		}
	};

	const onRemoveContact = async (id: string) => {
		try {
			const patch = { kind: "stranger" };
			const updated = await invoke<Peer>("update_peer", { id, patch });
			usePeerStore.getState().setPeerData(updated.endpointId, updated);
			queryClient.invalidateQueries({ queryKey: ["contacts"] });
		} catch {
			toast.error(t("errors:error_updating_contact"));
		}
	};

	const onSendDevice = (device: DeviceView) => {
		setShareDialogData({ visible: true, data: { peer: device.peer } });
	};

	const onRemoveDevice = async (device: DeviceView) => {
		try {
			await invoke("kick_device", { endpointId: device.peer.endpointId });
		} catch (e) {
			toastError(e, "peers:error_removing_device");
		}
	};

	const onBlockPeer = async (peer: Partial<Peer>) => {
		const shouldBlock = peer.trustLevel !== "blocked";
		try {
			if (shouldBlock)
				await invoke("block_peer", { endpointId: peer.endpointId });
			else await invoke("unblock_peer", { endpointId: peer.endpointId });
		} catch {
			toast.error(
				t(shouldBlock ? "errors:blocking_peer" : "errors:unblocking_peer"),
			);
		}
	};

	const onToggleTrust = async (id: string, currentTrust: TrustLevel) => {
		try {
			const patch = {
				trustLevel: currentTrust === "untrusted" ? "trusted" : "untrusted",
			};
			await invoke("update_peer", { id, patch });
			// TODO: instead of invalidating the query let's mutate the peer we just changed only.
			queryClient.invalidateQueries({ queryKey: ["contacts"] });
		} catch {
			toast.error(t("errors:error_updating_contact"));
		}
	};

	const [visiblePeers, expandedPeers] = useMemo(() => {
		if (nearbyPeers.length > 6)
			return [nearbyPeers.slice(0, 6), nearbyPeers.slice(6)];
		return [nearbyPeers, []];
	}, [nearbyPeers]);

	const columns = createColumns(t, {
		onSend,
		onRemoveContact,
		onToggleTrust,
		onAddToPersonal,
	});

	const deviceColumns = createDeviceColumns(t, {
		onSend: onSendDevice,
		onRemove: onRemoveDevice,
	});

	// @ts-expect-error
	useOnClickOutside(peerRef, handleClickOutside);

	useEffect(() => {
		const onKeyDown = (e: KeyboardEvent) => {
			if (e.key === "Escape") {
				setSelectedPeer(null);
				peerRef.current = null;
			}
		};

		window.addEventListener("keydown", onKeyDown);
		hydratePeerStore();
		hydrateFamilyStore();
		return () => window.removeEventListener("keydown", onKeyDown);
	}, []);

	return (
		<div
			className="menu-overlay w-full space-y-8 pt-16"
			data-active={`${!!selectedPeer}`}
		>
			{(!nearbyPeers || nearbyPeers.length === 0) &&
			devices.length === 0 &&
			(!contacts || contacts.length === 0) ? (
				<section className="z-10">
					<HolographicEmpty
						geometry="peer"
						title={t("empty_nearby_title")}
						description={t("empty_nearby_description")}
						action={<RefreshDiscoveryButton showLabel />}
					/>
				</section>
			) : (
				nearbyPeers.length > 0 && (
					<section className="z-10">
						<div className="flex flex-row items-center justify-between px-2">
							<h2 className="font-bold text-xl">{t("nearby_peers")}</h2>
							<div className="flex items-center gap-x-1">
								{nearbyPeers.length > 6 && (
									<Button
										variant="ghost"
										className="group padding-0 h-6 gap-1 font-medium text-blue-400 text-xs hover:text-blue-500"
										onClick={toggleExpanded}
									>
										<span className="relative after:absolute after:bottom-0 after:left-0 after:h-px after:w-full after:origin-left after:scale-x-0 after:bg-current after:transition-transform after:duration-200 after:ease-in-out group-hover:after:scale-x-100">
											{t(
												nearbyExpanded ? "action_collapse" : "action_view_all",
												{
													ns: "common",
												},
											)}
										</span>
										<motion.div
											animate={{
												transform: nearbyExpanded
													? "rotate(-180deg)"
													: "rotate(0deg)",
											}}
										>
											<HeroIcon
												name="chevron-down"
												className="h-4 w-4"
												iconStyle="micro"
											/>
										</motion.div>
									</Button>
								)}
								<RefreshDiscoveryButton />
							</div>
						</div>
						<div className="no-scrollbar relative flex w-full snap-x snap-mandatory flex-row gap-2 p-2">
							<AnimatePresence initial={true} mode="popLayout">
								<div className="grid w-full min-w-full snap-center grid-cols-3 gap-2">
									{visiblePeers.map((peer, index) => (
										<PeerWideCard
											key={peer.endpointId || `peer-wide-${index}`}
											ref={
												selectedPeer === peer.endpointId ? peerRef : undefined
											}
											peer={peer.peer || {}}
											endpointId={peer.endpointId}
											index={index}
											selected={selectedPeer === peer.endpointId}
											onSelect={handleSelect}
											onSendFiles={handleSendFiles(peer)}
											onBlockPeer={onBlockPeer}
										/>
									))}
									{nearbyExpanded &&
										expandedPeers.map((peer, index) => (
											<motion.div
												key={peer.endpointId || `peer-wide-${index}`}
												variants={variants}
												initial="initial"
												animate="animate"
												exit="exit"
												transition={transition}
												style={{
													zIndex: selectedPeer === peer.endpointId ? 10 : 0,
												}}
											>
												<PeerWideCard
													ref={
														selectedPeer === peer.endpointId
															? peerRef
															: undefined
													}
													peer={peer.peer || {}}
													endpointId={peer.endpointId}
													index={index}
													selected={selectedPeer === peer.endpointId}
													onSelect={handleSelect}
													onSendFiles={handleSendFiles(peer)}
												/>
											</motion.div>
										))}
								</div>
							</AnimatePresence>
						</div>
					</section>
				)
			)}
			{devices.length > 0 && (
				<section className="px-2">
					<div className="mb-4 flex items-center justify-between">
						<h2 className="font-bold text-xl">{t("my_devices")}</h2>
						<RefreshDiscoveryButton />
					</div>
					<DataTable columns={deviceColumns} data={devices} />
				</section>
			)}
			{contacts && contacts.length > 0 && (
				<section className="px-2">
					<h2 className="mb-4 font-bold text-xl">{t("contacts")}</h2>
					<DataTable
						columns={columns}
						data={contacts}
						pagination
						page={page}
						pages={pages}
						onPageChange={setPage}
					/>
				</section>
			)}
			<DeviceInviteDrawer ref={deviceDrawerRef} />
		</div>
	);
};
