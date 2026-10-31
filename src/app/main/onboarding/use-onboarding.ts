import { invoke } from "@tauri-apps/api/core";
import { emit } from "@tauri-apps/api/event";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useLocation, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { useUser, useUserLoaded, useUserStore } from "@/lib/store/user";
import type { Onboarding, OnboardingStepId } from "@/type";
import { lastStepId, onboardingFlow, resumeStepId, stepIndex } from "./steps";

export const onboardingPath = (id: OnboardingStepId) => `/onboarding/${id}`;

const stepIdFromPath = (pathname: string): OnboardingStepId | undefined => {
	const [, , stepId] = pathname.split("/");
	return (stepId as OnboardingStepId) || undefined;
};

async function persistOnboarding(patch: Partial<Onboarding>): Promise<boolean> {
	const user = useUserStore.getState().user;
	if (!user) return false;

	const onboarding = { ...user.onboarding, ...patch };

	try {
		await invoke("update_user_cmd", { id: user.id, patch: { onboarding } });
		emit("ui:update_user", { onboarding });
		return true;
	} catch (exception) {
		console.log("[onboarding.persist] Error:", JSON.stringify(exception));
		return false;
	}
}

if (import.meta.env.DEV) {
	(window as unknown as Record<string, unknown>).resetOnboarding = (
		step: OnboardingStepId | null = null,
	) => persistOnboarding({ step, completed: false });
}

export function useOnboardingGate() {
	const user = useUser();
	const loaded = useUserLoaded();
	const { pathname } = useLocation();
	const navigate = useNavigate();

	const onboarding = user?.onboarding;
	const inOnboarding = pathname.startsWith("/onboarding");
	const pending = loaded && !!user && !onboarding?.completed;

	useEffect(() => {
		if (!loaded) return;

		if (pending && !inOnboarding) {
			navigate(onboardingPath(resumeStepId(onboarding)), { replace: true });
		} else if (!pending && inOnboarding) {
			navigate("/", { replace: true });
		}
	}, [loaded, pending, inOnboarding, onboarding, navigate]);

	return { ready: loaded, onboardingPending: pending };
}

export function useOnboarding() {
	const { pathname } = useLocation();
	const stepId = stepIdFromPath(pathname);
	const navigate = useNavigate();
	const user = useUser();
	const [finishing, setFinishing] = useState(false);

	const { t } = useTranslation("errors");

	const flow = useMemo(() => onboardingFlow(), []);
	const index = stepIndex(stepId);
	const step = index === -1 ? undefined : flow[index];

	const isFirst = index <= 0;
	const isLast = index === flow.length - 1;

	const furthestIndex = stepIndex(user?.onboarding?.step);

	const goTo = useCallback(
		(id: OnboardingStepId) => navigate(onboardingPath(id)),
		[navigate],
	);

	const back = useCallback(() => {
		if (isFirst) return;
		goTo(flow[index - 1].id);
	}, [isFirst, flow, index, goTo]);

	const finish = useCallback(async () => {
		setFinishing(true);
		const saved = await persistOnboarding({
			step: lastStepId(),
			completed: true,
		});
		setFinishing(false);

		if (saved) navigate("/", { replace: true });
		else toast.error(t("errors:error_completing_onboarding"));
	}, [navigate, t]);

	const next = useCallback(() => {
		if (isLast) {
			finish();
			return;
		}
		goTo(flow[index + 1].id);
	}, [isLast, finish, flow, index, goTo]);

	useEffect(() => {
		if (index === -1 || index <= furthestIndex) return;
		persistOnboarding({ step: flow[index].id });
	}, [index, furthestIndex, flow]);

	return {
		steps: flow,
		step,
		stepId,
		index,
		furthestIndex: Math.max(furthestIndex, index),
		isFirst,
		isLast,
		finishing,
		back,
		next,
		goTo,
		finish,
		fallbackStepId: resumeStepId(user?.onboarding),
	};
}
