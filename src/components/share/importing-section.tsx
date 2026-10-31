import {
	AnimatePresence,
	motion,
	useSpring,
	type Variants,
} from "motion/react";
import { type ReactNode, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { useImportProgress } from "@/lib/store/parcels";
import { cn } from "@/lib/utils";
import { HeroIcon } from "../hero-icon";
import { ProgressBar } from "../progress-bar";
import { FolderCogIcon } from "./folder-cog-icon";

interface ImportingSectionProps {
	avatarVariants: Variants;
	parcelId?: number;
	files?: number;
	failed?: boolean;
}

const iconVariants: Variants = {
	initial: { opacity: 0, transform: "scale(0.5)", filter: "blur(6px)" },
	visible: { opacity: 1, transform: "scale(1)", filter: "blur(0px)" },
	exit: { opacity: 0, transform: "scale(0.5)", filter: "blur(6px)" },
};

interface CrossfadeProps {
	active: boolean;
	children: ReactNode;
}

/**
 * Both texts share the same grid cell so swapping them never changes the
 * parent's size or position; only opacity and blur move.
 */
const Crossfade = ({ active, children }: CrossfadeProps) => (
	<motion.span
		className="col-start-1 row-start-1 text-center"
		animate={{
			opacity: active ? 1 : 0,
			filter: active ? "blur(0px)" : "blur(4px)",
		}}
		transition={{ duration: 0.24 }}
		aria-hidden={!active}
	>
		{children}
	</motion.span>
);

export const ImportingSection = ({
	avatarVariants,
	parcelId,
	files = 1,
	failed = false,
}: ImportingSectionProps) => {
	const { t } = useTranslation("share");

	const importProgress = useImportProgress(parcelId);
	const progress = useSpring(0, { duration: 0.2, bounce: 0 });

	useEffect(() => {
		progress.set(importProgress);
	}, [importProgress]);

	return (
		<AnimatePresence mode="popLayout" initial={false}>
			<div className="flex h-full w-full flex-col items-center gap-y-4 pt-[16vh] pb-[16vh]">
				<motion.div
					layoutId="share-avatar"
					variants={avatarVariants}
					initial="initial"
					animate="visible"
					exit="exit"
					className="z-10 flex items-center justify-center overflow-hidden"
					style={{ height: 64, width: 64, borderRadius: 32 }}
				>
					<div
						className={cn(
							"flex h-full w-full items-center justify-center text-white transition-colors duration-300",
							failed ? "bg-red-500" : "bg-[#67ABED]",
						)}
					>
						<AnimatePresence mode="popLayout" initial={false}>
							<motion.div
								key={failed ? "import-failed-icon" : "import-icon"}
								variants={iconVariants}
								initial="initial"
								animate="visible"
								exit="exit"
								transition={{ duration: 0.2 }}
								className="flex items-center justify-center"
							>
								{failed ? (
									<HeroIcon name="close" className="h-6 w-6" />
								) : (
									<FolderCogIcon spinning />
								)}
							</motion.div>
						</AnimatePresence>
					</div>
				</motion.div>
				<div className="relative">
					<motion.p
						layout="position"
						layoutId="share-header-title"
						className="grid place-items-center"
						variants={avatarVariants}
						initial="initial"
						animate="visible"
						exit="exit"
					>
						<Crossfade active={!failed}>{t("importing_title")}</Crossfade>
						<Crossfade active={failed}>{t("import_failed_title")}</Crossfade>
					</motion.p>
					<motion.p
						layout="position"
						layoutId="share-header-subtitle"
						className="absolute left-1/2 grid -translate-x-1/2 place-items-center text-nowrap text-muted"
						variants={avatarVariants}
						initial="initial"
						animate="visible"
						exit="exit"
					>
						<Crossfade active={!failed}>
							{t("importing_description", { count: files })}
						</Crossfade>
						<Crossfade active={failed}>
							{t("import_failed_description")}
						</Crossfade>
					</motion.p>
				</div>
				<motion.div
					className="w-64 pt-6"
					animate={{ opacity: failed ? 0 : 1 }}
					transition={{ duration: 0.16 }}
				>
					<ProgressBar progress={progress} />
				</motion.div>
			</div>
		</AnimatePresence>
	);
};
