import { useParams } from "react-router-dom";
import type { OnboardingStepId } from "@/type";
import { onboardingFlow, stepIndex } from "./steps";

export const OnboardingStepRoute = () => {
	const { stepId } = useParams<{ stepId: OnboardingStepId }>();

	const index = stepIndex(stepId);
	if (index === -1) return null;

	const { Component } = onboardingFlow()[index];
	return <Component />;
};
