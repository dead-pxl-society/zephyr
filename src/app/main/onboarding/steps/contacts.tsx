import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";
import { useSetAtom } from "jotai";
import { AnimatePresence, motion, type Variants } from "motion/react";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { HeroIcon } from "@/components/hero-icon";
import { HolographicModelCanvas } from "@/components/holographic-crt";
import { ContinueButton } from "@/components/onboarding/continue-button";
import { DeviceList } from "@/components/onboarding/device-list";
import { DeviceListEmpty } from "@/components/onboarding/device-list-empty";
import { ExpandingArrowRight } from "@/components/onboarding/expanding-arrow-right";
import Scanner from "@/components/onboarding/scanner";
import { Button } from "@/components/ui/button";
import { hydrateFamilyStore, useFamilyDevices } from "@/lib/store/family";
import { addContactDrawerAtom } from "@/lib/store/jotai";
import {
	hydratePeerStore,
	useNearbyPeers,
	usePeerStore,
} from "@/lib/store/peers";
import { queryClient } from "@/lib/store/react-query";
import type { EphemeralPeer, Peer } from "@/type";
import { useOnboarding } from "../use-onboarding";

const rootVariants: Variants = {
	initial: {},
	animate: { transition: { delayChildren: 0.08, staggerChildren: 0.07 } },
	exit: {
		opacity: 0,
		scale: 0.95,
	},
};

const itemVariants: Variants = {
	initial: { opacity: 0, y: 8 },
	animate: { opacity: 1, y: 0 },
};

const LIMIT = 20;

const CONTACTS_KEY = ["contacts", "list", 0];

const fetchContacts = async (page: number) => {
	const offset = page * LIMIT;
	const contacts: Peer[] = await invoke("get_peers", {
		pagination: { offset, limit: LIMIT, kind: "contact" },
	});

	return contacts;
};

export const ContactsStep = () => {
	const { next } = useOnboarding();

	const nearbyPeers = useNearbyPeers();
	const devices = useFamilyDevices();
	const { data: contacts, isFetched } = useQuery({
		queryKey: CONTACTS_KEY,
		queryFn: () => fetchContacts(0),
		placeholderData: keepPreviousData,
	});

	const setAddContactDrawerData = useSetAtom(addContactDrawerAtom);

	const [pending, setPending] = useState<string[]>([]);
	const [hydrated, setHydrated] = useState(false);
	const [entered, setEntered] = useState(false);

	const { t } = useTranslation();

	useEffect(() => {
		Promise.allSettled([hydratePeerStore(), hydrateFamilyStore()]).then(() =>
			setHydrated(true),
		);
	}, []);

	const ready = hydrated && isFetched;

	const displayAddContactDrawer = () =>
		setAddContactDrawerData({ visible: true });

	const lateEnter = entered
		? ({ initial: "initial", animate: "animate" } as const)
		: {};

	const handleAddContact = (peer: EphemeralPeer) => async () => {
		const { endpointId } = peer;
		const payload = peer.peer?.id ? { dbId: peer.peer.id } : { endpointId };

		setPending((prev) => [...prev, endpointId]);

		try {
			const updated = await invoke<Peer>("add_contact", payload);
			usePeerStore.getState().setPeerData(endpointId, updated);
			queryClient.setQueryData<Peer[]>(CONTACTS_KEY, (prev) =>
				prev?.some((contact) => contact.id === updated.id)
					? prev
					: [...(prev ?? []), updated],
			);
			queryClient.invalidateQueries({ queryKey: ["contacts"] });
		} catch {
			toast.error(t("errors:generic_add_contact"));
		} finally {
			setPending((prev) => prev.filter((id) => id !== endpointId));
		}
	};

	const handleRemoveContact = (contact: Peer) => async () => {
		const { id, endpointId } = contact;

		setPending((prev) => [...prev, endpointId]);

		try {
			const updated = await invoke<Peer>("update_peer", {
				id,
				patch: { kind: "stranger" },
			});
			usePeerStore.getState().setPeerData(updated.endpointId, updated);
			queryClient.setQueryData<Peer[]>(CONTACTS_KEY, (prev) =>
				prev?.filter((contact) => contact.id !== id),
			);
			queryClient.invalidateQueries({ queryKey: ["contacts"] });
		} catch {
			toast.error(t("errors:error_updating_contact"));
		} finally {
			setPending((prev) => prev.filter((peerId) => peerId !== endpointId));
		}
	};

	const nearby = useMemo(() => {
		const shortId = (id: string) => id.slice(0, 10);
		const known = new Set([
			...devices.map((device) => shortId(device.peer.endpointId)),
			...(contacts ?? []).map((contact) => shortId(contact.endpointId)),
		]);

		return nearbyPeers
			.filter(
				(peer) =>
					peer.peer?.kind !== "contact" &&
					peer.peer?.kind !== "device" &&
					!known.has(shortId(peer.endpointId)),
			)
			.map((peer) => ({
				endpointId: peer.endpointId,
				name: peer.peer?.name,
				platform: peer.peer?.platform,
				actionLabel: t("peers:action_add_contact"),
				actionDisabled: pending.includes(peer.endpointId),
				onAction: handleAddContact(peer),
			}));
	}, [contacts, devices, nearbyPeers, pending, t]);

	return (
		<div className="relative grid h-full w-full grid-cols-[1fr_1.4fr] gap-4 p-4 py-10">
			<motion.div
				variants={rootVariants}
				initial="initial"
				animate="animate"
				exit="exit"
			>
				<motion.div
					variants={itemVariants}
					className="relative h-full min-h-0 overflow-hidden rounded-2xl border border-border bg-[#0A0A0A] dark:bg-transparent"
				>
					<div className="absolute size-full">
						<Scanner
							color1="#1C4E7D"
							color2="#3E97E6"
							color3="#BFE1FF"
							scanDirection="horizontal"
							ripple={0}
							lineSharpness={0.25}
							sweepWidth={2.5}
							speed={0.5}
							sweepSpeed={0.7}
							sweepFalloff={6}
						/>
					</div>
					<div className="absolute size-full">
						<HolographicModelCanvas
							geometry="earth"
							spin={true}
							scale={0.17}
							spinSpeed={0.225}
							baseColor={[0.553, 0.749, 0.945]}
							// baseColor={[0.137, 0.541, 0.875]}
						/>
					</div>
				</motion.div>
			</motion.div>
			<motion.div
				variants={rootVariants}
				initial="initial"
				animate={ready ? "animate" : "initial"}
				exit="exit"
				onAnimationComplete={() => setEntered(true)}
				className="relative flex min-h-0 flex-col items-start justify-center gap-4"
			>
				<motion.div
					layout="position"
					className="flex w-full flex-col items-center gap-1"
				>
					<motion.p
						variants={itemVariants}
						className="text-center font-medium text-2xl"
					>
						{t("onboarding:contacts_title")}
					</motion.p>
					<motion.p
						variants={itemVariants}
						className="w-[80%] text-center text-muted"
					>
						{t("onboarding:contacts_description")}
					</motion.p>
				</motion.div>
				<motion.div
					layout="position"
					variants={itemVariants}
					className="w-md self-center"
				>
					<DeviceList
						label={t("peers:nearby_peers")}
						devices={nearby}
						action={
							<Button
								variant="zephyr"
								size="sm"
								className="h-5 gap-2 rounded-full border-zephyr bg-zephyr/20 px-1.5 font-mono text-xs text-zephyr uppercase hover:bg-zephyr/40"
								onClick={displayAddContactDrawer}
							>
								<HeroIcon
									name="user-plus"
									iconStyle="micro"
									className="size-3.5"
								/>
								{t("peers:action_add_manually")}
							</Button>
						}
						empty={
							<DeviceListEmpty
								title={t("peers:empty_nearby_title")}
								description={t("peers:empty_nearby_description")}
							/>
						}
					/>
				</motion.div>
				<AnimatePresence initial={false} mode="popLayout">
					{contacts && contacts.length > 0 && (
						<motion.div
							key="contacts"
							layout="position"
							variants={itemVariants}
							exit={{ opacity: 0 }}
							{...lateEnter}
							className="w-md self-center"
						>
							<DeviceList
								label={t("peers:contacts")}
								devices={contacts.map((contact) => ({
									endpointId: contact.endpointId,
									name: contact.name,
									platform: contact.platform,
									actionLabel: t("peers:action_remove"),
									actionDisabled: pending.includes(contact.endpointId),
									onAction: handleRemoveContact(contact),
								}))}
							/>
						</motion.div>
					)}
				</AnimatePresence>
				<motion.div
					layout="position"
					variants={itemVariants}
					className="self-center"
				>
					<ContinueButton onClick={next}>
						{t("common:next")} <ExpandingArrowRight />
					</ContinueButton>
				</motion.div>
			</motion.div>
		</div>
	);
};
