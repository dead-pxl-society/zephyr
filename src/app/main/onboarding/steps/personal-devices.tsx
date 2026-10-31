import { invoke } from "@tauri-apps/api/core";
import { AnimatePresence, motion, type Variants } from "motion/react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { HeroIcon } from "@/components/hero-icon";
import { HolographicModelCanvas } from "@/components/holographic-crt";
import {
	DeviceInviteDrawer,
	type DeviceInviteHandles,
} from "@/components/main/device-invite-drawer";
import { ContinueButton } from "@/components/onboarding/continue-button";
import { DeviceList } from "@/components/onboarding/device-list";
import { DeviceListEmpty } from "@/components/onboarding/device-list-empty";
import { ExpandingArrowRight } from "@/components/onboarding/expanding-arrow-right";
import { GridScan } from "@/components/onboarding/grid-scan";
import { toastError } from "@/lib/errors";
import { usePrefersDark } from "@/lib/hooks/use-color-scheme";
import { hydrateFamilyStore, useFamilyDevices } from "@/lib/store/family";
import { hydratePeerStore, useNearbyPeers } from "@/lib/store/peers";
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

export const PersonalDevicesStep = () => {
	const { next } = useOnboarding();

	const prefersDark = usePrefersDark();

	const nearbyPeers = useNearbyPeers();
	const devices = useFamilyDevices();

	const deviceDrawerRef = useRef<DeviceInviteHandles>(null);

	const [ready, setReady] = useState(false);
	const [entered, setEntered] = useState(false);

	const { t } = useTranslation();

	useEffect(() => {
		Promise.allSettled([hydratePeerStore(), hydrateFamilyStore()]).then(() =>
			setReady(true),
		);
	}, []);

	const lateEnter = entered
		? ({ initial: "initial", animate: "animate" } as const)
		: {};

	const handleAddDevice = (endpointId: string) => async () => {
		try {
			const sessionId = await invoke<number>("pair_device", { endpointId });
			deviceDrawerRef.current?.present(sessionId);
		} catch (e) {
			toastError(e, "errors:error_pairing_device");
		}
	};

	const nearby = useMemo(() => {
		const deviceShortIds = new Set(
			devices.map((d) => d.peer.endpointId.slice(0, 10)),
		);

		return nearbyPeers
			.filter((peer) => !deviceShortIds.has(peer.endpointId.slice(0, 10)))
			.map((peer) => ({
				endpointId: peer.endpointId,
				name: peer.peer?.name,
				platform: peer.peer?.platform,
				actionLabel: t("peers:action_add_device"),
				onAction: handleAddDevice(peer.endpointId),
			}));
	}, [devices, nearbyPeers, t]);

	return (
		<div className="relative grid h-full w-full grid-cols-[1.4fr_1fr] gap-4 p-4 py-10">
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
						{t("onboarding:personal_devices_title")}
					</motion.p>
					<motion.p
						variants={itemVariants}
						className="w-[80%] text-center text-muted"
					>
						{t("onboarding:personal_devices_description")}
					</motion.p>
				</motion.div>
				<motion.div
					layout="position"
					variants={itemVariants}
					className="flex h-8 items-center justify-center gap-x-2 self-center rounded-full bg-background-popup px-4"
				>
					<HeroIcon
						name="exclamation-triangle"
						className="size-4 text-amber-400"
						iconStyle="micro"
					/>
					<span className="text-muted text-sm">
						{t("onboarding:personal_devices_warning")}
					</span>
				</motion.div>
				<motion.div
					layout="position"
					variants={itemVariants}
					className="w-md self-center"
				>
					<DeviceList
						label={t("peers:nearby_peers")}
						devices={nearby}
						empty={
							<DeviceListEmpty
								title={t("peers:empty_nearby_title")}
								description={t("peers:empty_nearby_description")}
							/>
						}
					/>
				</motion.div>
				<AnimatePresence initial={false} mode="popLayout">
					{devices.length > 0 && (
						<motion.div
							key="devices"
							layout="position"
							variants={itemVariants}
							exit={{ opacity: 0 }}
							{...lateEnter}
							className="w-md self-center"
						>
							<DeviceList
								label={t("peers:personal_devices")}
								devices={devices.map(({ peer, online }) => ({
									endpointId: peer.endpointId,
									name: peer.name,
									platform: peer.platform,
									online,
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
						<GridScan
							linesColor={prefersDark ? "#999999" : "#bfbfbf"}
							scanColor="#B0D2F6"
							scanOpacity={0.5}
							gridScale={0.08}
							scanPhaseTaper={0.25}
							lineJitter={0.05}
						/>
					</div>
					<div className="absolute top-2 size-full">
						<HolographicModelCanvas
							geometry="peer"
							spin={true}
							scale={2.25}
							spinSpeed={0.225}
							rotation={[0.18, Math.PI + 0.75, 0]}
							baseColor={[0.553, 0.749, 0.945]}
							// baseColor={[0.137, 0.541, 0.875]}
						/>
					</div>
				</motion.div>
			</motion.div>
			<DeviceInviteDrawer ref={deviceDrawerRef} fullscreen />
		</div>
	);
};
