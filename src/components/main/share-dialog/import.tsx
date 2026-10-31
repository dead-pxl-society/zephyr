import { AnimatePresence, motion, useSpring } from "motion/react";
import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { ProgressBar } from "@/components/progress-bar";
import { FolderCogIcon } from "@/components/share/folder-cog-icon";
import { Spinner } from "@/components/ui/spinner";
import { useImportProgress } from "@/lib/store/parcels";

interface ImportSectionProps {
	parcelId?: number | null;
	files?: number;
	connecting?: boolean;
}

export const ImportSection = ({
	files,
	parcelId,
	connecting,
}: ImportSectionProps) => {
	const importProgress = useImportProgress(parcelId || 0);

	const progress = useSpring(0, { duration: 0.2, bounce: 0 });

	const { t } = useTranslation(["share"]);

	useEffect(() => {
		progress.set(importProgress);
	}, [importProgress]);

	return (
		<div className="flex h-full w-full flex-col items-center gap-y-4 pt-[16vh] pb-[16vh]">
			<div
				className="flex h-full w-full items-center justify-center bg-[#67ABED]"
				style={{ height: 64, width: 64, borderRadius: 32 }}
			>
				<FolderCogIcon spinning />
			</div>
			<div className="relative">
				<p className="text-center">{t("importing_title")}</p>
				<p className="text-nowrap text-center text-muted">
					{t("importing_description", { count: files })}
				</p>
			</div>
			<AnimatePresence initial={false} mode="popLayout">
				{connecting ? (
					<motion.div
						key="connecting-status"
						className="flex items-center gap-1 pt-6 text-muted"
						initial={{ opacity: 0, filter: "blur(4px)" }}
						animate={{ opacity: 1, filter: "blur(0px)" }}
						exit={{ opacity: 0, filter: "blur(4px)" }}
					>
						<Spinner />
						<span>{t("peers:status_connecting_to_peer")}</span>
					</motion.div>
				) : (
					<motion.div
						key="progress-container"
						className="w-64 space-y-1 pt-6"
						initial={{ opacity: 0, filter: "blur(4px)" }}
						animate={{ opacity: 1, filter: "blur(0px)" }}
						exit={{ opacity: 0, filter: "blur(4px)" }}
					>
						<ProgressBar progress={progress} />
						<p className="text-center font-semibold text-muted text-sm">
							{Math.floor(importProgress * 100)}%
						</p>
					</motion.div>
				)}
			</AnimatePresence>
		</div>
	);
};
