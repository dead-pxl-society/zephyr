import { motion, type Variants } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import handHeartPath from "@/assets/icons/hand-heart.svg";
import wordmarkPath from "@/assets/icons/wordmark.svg";
import { ZephConfetti } from "@/components/onboarding/zeph-confetti";
import { useOnboarding } from "../use-onboarding";

const OUTRO_DURATION = 6000;

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

export const OutroStep = () => {
	const [celebrating, setCelebrating] = useState(false);

	const { finish } = useOnboarding();

	const { t } = useTranslation();

	const finishRef = useRef(finish);
	finishRef.current = finish;

	useEffect(() => {
		const timeout = setTimeout(() => finishRef.current(), OUTRO_DURATION);
		return () => clearTimeout(timeout);
	}, []);

	return (
		<motion.div
			variants={rootVariants}
			initial="initial"
			animate="animate"
			exit="exit"
			className="relative flex h-full w-full flex-col items-center justify-center gap-4"
		>
			{celebrating && <ZephConfetti />}
			<motion.span
				variants={itemVariants}
				className="relative z-10 text-center font-mono text-md text-muted uppercase"
			>
				{t("onboarding:outro_thank_you")}
			</motion.span>
			<motion.div
				variants={itemVariants}
				className="relative z-10 flex items-center gap-4"
			>
				<img src={wordmarkPath} alt="Zephyr wordmark" className="w-72" />
			</motion.div>
			<motion.span
				variants={itemVariants}
				className="relative z-10 text-center text-muted"
			>
				{t("onboarding:outro_description")}
			</motion.span>
			<motion.div
				variants={itemVariants}
				onAnimationComplete={() => setCelebrating(true)}
				className="absolute bottom-0 z-10"
			>
				<img src={handHeartPath} alt="Hand heart icon" className="w-16" />
			</motion.div>
		</motion.div>
	);
};
