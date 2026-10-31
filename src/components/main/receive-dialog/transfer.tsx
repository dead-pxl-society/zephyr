import { motion, useSpring } from "motion/react";
import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { HeroIcon } from "@/components/hero-icon";
import { ProgressBar } from "@/components/progress-bar";
import { Button } from "@/components/ui/button";
import { DialogDescription, DialogTitle } from "@/components/ui/dialog";
import {
	useInboundTransferByTicket,
	useInboundTransferProgressByTicket,
} from "@/lib/store/transfers";

type TransferSectionProps = {
	ticket: string | null;
	onDone?: () => void;
};

export const TransferSection = ({ ticket, onDone }: TransferSectionProps) => {
	const { t } = useTranslation(["common", "share", "peers"]);

	const inbound = useInboundTransferByTicket(ticket);

	const transferProgress = useInboundTransferProgressByTicket(ticket);
	const progress = useSpring(0, { duration: 0.2, bounce: 0 });

	useEffect(() => {
		progress.set(transferProgress || 0);
	}, [transferProgress]);

	useEffect(() => {
		if (inbound?.status === "done") {
			setTimeout(() => {
				if (onDone) onDone();
			}, 950);
		}
	}, [inbound?.status]);

	return (
		<div className="flex flex-col gap-4">
			<div className="space-y-1">
				<DialogTitle className="line-clamp-1">
					{t("share:receiving_transfer_title")}
				</DialogTitle>
				<DialogDescription className="line-clamp-2">
					{t("share:receiving_transfer_description")}
				</DialogDescription>
			</div>
			<motion.div
				initial={{ opacity: 0, transform: "scale(0.75)", filter: "blur(4px)" }}
				animate={{ opacity: 1, transform: "scale(1)", filter: "blur(0)" }}
				exit={{ opacity: 0, transform: "scale(0.75)", filter: "blur(4px)" }}
				key={
					inbound?.status === "connecting" ||
					inbound?.status === "receiving" ||
					inbound?.status === "exporting"
						? "recv-status-progress"
						: `recv-status-${inbound?.status}`
				}
				className="flex w-full items-center justify-center"
			>
				{(inbound?.status === "connecting" ||
					inbound?.status === "receiving" ||
					inbound?.status === "exporting") && (
					<ProgressBar progress={progress} showPercentage />
				)}
				{inbound?.status === "done" && (
					<div className="flex flex-row items-center gap-x-2">
						<HeroIcon
							name="check-circle"
							className="h-5 w-5 text-green-500 dark:text-green-400"
							iconStyle="solid"
						/>
						<p>{t("peers:status_done")}</p>
					</div>
				)}
				{inbound?.status === "fail" && (
					<div className="flex flex-row items-center gap-x-2">
						<HeroIcon
							name="x-circle"
							className="h-5 w-5 text-red-500 dark:text-red-400"
							iconStyle="solid"
						/>
						<p>{t("peers:status_failed")}</p>
					</div>
				)}
			</motion.div>
			<Button
				onClick={onDone}
				className="h-7 flex-grow-0 self-end rounded-full py-0 active:scale-[0.96]"
				variant="secondary"
			>
				{t("common:done")}
			</Button>
		</div>
	);
};
