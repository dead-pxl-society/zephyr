import { motion } from "motion/react";
import { useTranslation } from "react-i18next";
import appIconUrl from "@/assets/icons/app-icon.avif";
import { ContinueButton } from "@/components/onboarding/continue-button";
import { FlyingPlane } from "@/components/onboarding/flying-plane";
import { useOnboarding } from "../use-onboarding";

export const WelcomeStep = () => {
	const { next } = useOnboarding();
	const { t } = useTranslation();

	return (
		<motion.div
			initial={{ opacity: 0, y: 8 }}
			animate={{ opacity: 1, y: 0 }}
			exit={{ opacity: 0, scale: 0.95 }}
			className="relative flex h-full w-full flex-col items-center justify-center"
		>
			<FlyingPlane />
			<div className="relative z-10 flex w-xl flex-col items-center justify-center gap-4">
				<img
					src={appIconUrl}
					alt="Zephyr's app icon"
					className="h-32 w-32 rounded-3xl shadow-lg"
				/>
				<p className="text-center text-3xl">{t("onboarding:welcome_title")}</p>
				<p className="text-center text-muted">
					{t("onboarding:welcome_description")}
				</p>
				<ContinueButton className="self-center" onClick={next}>
					{t("onboarding:action_start")}
				</ContinueButton>
			</div>
		</motion.div>
	);
};
