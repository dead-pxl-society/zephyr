import { useAtomValue } from "jotai";
import { AnimatePresence, motion, type Variants } from "motion/react";
import { cloneElement, useEffect, useMemo, useRef } from "react";
import { useTranslation } from "react-i18next";
import { Navigate, useOutlet } from "react-router-dom";
import { AddContactDrawer } from "@/components/main/add-contact-drawer";
import type { DynamicDrawerHandles } from "@/components/main/dynamic-drawer";
import { HANDOFF_SCALE } from "@/components/onboarding/crt-splash";
import { DeviceRequestDrawer } from "@/components/onboarding/device-request-drawer";
import { DotGrid } from "@/components/onboarding/dot-grid";
import { StepProgress } from "@/components/onboarding/step";
import { addContactDrawerAtom } from "@/lib/store/jotai";
import { onboardingPath, useOnboarding } from "./use-onboarding";

const contentVariants: Variants = {
	initial: { opacity: 0, filter: "blur(10px)", scale: HANDOFF_SCALE },
	animate: {
		opacity: 1,
		filter: "blur(0px)",
		scale: 1,
		transition: { delay: 0.08, duration: 0.45, ease: [0.25, 0.46, 0.45, 0.94] },
	},
	exit: { opacity: 0, filter: "blur(4px)" },
};

export const OnboardingLayout = () => {
	const { steps, step, stepId, index, furthestIndex, goTo, fallbackStepId } =
		useOnboarding();

	const progressSteps = useMemo(
		() => steps.filter((entry) => !entry.hidden),
		[steps],
	);

	const outlet = useOutlet();

	const addContactDrawerData = useAtomValue(addContactDrawerAtom);
	const addContactDrawerRef = useRef<DynamicDrawerHandles>(null);

	const { t } = useTranslation();

	const stepText = () => {
		if (stepId === "welcome") return t("onboarding:step_welcome");
		if (stepId === "share-shortcut" || stepId === "share-shortcut-linux")
			return t("onboarding:step_share");
		if (stepId === "all-shortcuts") return t("onboarding:step_shortcuts");
		if (stepId === "personal-devices")
			return t("onboarding:step_personal_devices");
		if (stepId === "contacts") return t("onboarding:step_contacts");
		if (stepId === "notifications-and-sounds")
			return t("onboarding:step_notifications_and_sounds");
		return t("onboarding:step_none");
	};

	useEffect(() => {
		if (addContactDrawerRef.current && addContactDrawerData.visible) {
			addContactDrawerRef.current.present();
		}
	}, [addContactDrawerData]);

	if (stepId && !step) {
		return <Navigate to={onboardingPath(fallbackStepId)} replace />;
	}

	return (
		<main className="absolute inset-0 macos-glass:bg-background/70 p-2 shadow-lg macos-glass:backdrop-blur-xl">
			<div
				data-tauri-drag-region
				className="absolute top-0 right-0 left-0 z-10 h-2"
			/>
			<motion.div
				layoutId="main-app-content"
				className="h-full w-full self-end rounded-lg bg-background-surface/95 backdrop-blur-lg"
				style={{ width: "100%" }}
				transition={{ duration: 0.24, ease: [0.455, 0.03, 0.515, 0.955] }}
			>
				<motion.div
					variants={contentVariants}
					initial="initial"
					animate="animate"
					exit="exit"
					className="relative flex h-full w-full flex-col"
				>
					<div
						data-tauri-drag-region
						className="absolute top-0 z-10 h-12 w-full shrink-0 rounded-t-lg"
					/>
					<DotGrid className="absolute inset-0 -z-10" />
					<div className="min-h-0 flex-1">
						<AnimatePresence mode="wait">
							{outlet && cloneElement(outlet, { key: stepId })}
						</AnimatePresence>
					</div>
					{!step?.hidden && (
						<div className="absolute bottom-4 left-4 flex items-center gap-4">
							<StepProgress
								count={progressSteps.length}
								index={index}
								furthestIndex={furthestIndex}
								onSelect={(target) => goTo(progressSteps[target].id)}
							/>
							<span className="font-mono text-muted/80 text-xs uppercase">{`// ${stepText()}`}</span>
						</div>
					)}
				</motion.div>
			</motion.div>
			<AddContactDrawer ref={addContactDrawerRef} fullscreen />
			<DeviceRequestDrawer />
		</main>
	);
};
