import { platform } from "@tauri-apps/plugin-os";
import type { ComponentType } from "react";
import type { Onboarding, OnboardingStepId } from "@/type";
import { AllShortcutsStep } from "./steps/all-shortcuts";
import { ContactsStep } from "./steps/contacts";
import { NotificationsAndSoundsStep } from "./steps/notifications-and-sounds";
import { OutroStep } from "./steps/outro";
import { PersonalDevicesStep } from "./steps/personal-devices";
import { ShareShortcutStep } from "./steps/share-shortcut";
import { ShareShortcutLinuxStep } from "./steps/share-shortcut-linux";
import { WelcomeStep } from "./steps/welcome";

type StepPlatform = "macos" | "windows" | "linux";

export interface OnboardingStep {
	id: OnboardingStepId;
	Component: ComponentType;
	platforms?: StepPlatform[];
	hidden?: boolean;
}

export const ONBOARDING_STEPS: OnboardingStep[] = [
	{ id: "welcome", Component: WelcomeStep },
	{
		id: "share-shortcut",
		Component: ShareShortcutStep,
		platforms: ["macos", "windows"],
	},
	{
		id: "share-shortcut-linux",
		Component: ShareShortcutLinuxStep,
		platforms: ["linux"],
	},
	{ id: "all-shortcuts", Component: AllShortcutsStep },
	{ id: "personal-devices", Component: PersonalDevicesStep },
	{ id: "contacts", Component: ContactsStep },
	{ id: "notifications-and-sounds", Component: NotificationsAndSoundsStep },
	{ id: "outro", Component: OutroStep, hidden: true },
];

const stepPlatform = (): StepPlatform => {
	const current = platform();
	if (current === "macos") return "macos";
	if (current === "windows") return "windows";

	return "linux";
};

let flow: OnboardingStep[] | null = null;

export const onboardingFlow = (): OnboardingStep[] => {
	if (!flow) {
		const current = stepPlatform();
		flow = ONBOARDING_STEPS.filter(
			(step) => !step.platforms || step.platforms.includes(current),
		);
	}

	return flow;
};

export const stepIndex = (id?: OnboardingStepId | string | null): number =>
	id ? onboardingFlow().findIndex((step) => step.id === id) : -1;

export const firstStepId = (): OnboardingStepId => onboardingFlow()[0].id;

export const lastStepId = (): OnboardingStepId => {
	const steps = onboardingFlow();
	return steps[steps.length - 1].id;
};

export const resumeStepId = (
	onboarding?: Onboarding | null,
): OnboardingStepId => {
	const index = stepIndex(onboarding?.step);
	return index === -1 ? firstStepId() : onboardingFlow()[index].id;
};
