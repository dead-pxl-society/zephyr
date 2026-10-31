import { AnimatePresence, motion, useSpring, useTransform } from "motion/react";
import { useCallback, useEffect, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { DicebearAvatar } from "@/components/dicebear-avatar";
import { HeroIcon } from "@/components/hero-icon";
import { ProgressBar } from "@/components/progress-bar";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import type { Parcel } from "@/lib/store/parcels";
import {
	transferKey,
	useOutboundTransfer,
	useTransferProgress,
} from "@/lib/store/transfers";
import { cn, humanReadableSize } from "@/lib/utils";
import type { Peer } from "@/type";

interface ShareSingleSectionProps {
	peer: Peer;
	parcel: Parcel | null;
	onDone?: () => void;
	onNavBack?: () => void;
	onCancel?: (endpointId: string) => void;
}

export const ShareSingleSection = ({
	peer,
	parcel,
	onDone,
	onNavBack,
	onCancel,
}: ShareSingleSectionProps) => {
	const key =
		parcel?.id != null ? transferKey(parcel.id, peer.endpointId) : null;
	const outbound = useOutboundTransfer(key);
	const transferProgress = useTransferProgress(key);
	const status = outbound?.status || "idle";

	const progress = useSpring(0, { duration: 0.2, bounce: 0 });
	const progressText = useTransform(progress, (v) => `${Math.floor(v * 100)}%`);

	const { t } = useTranslation(["common", "share", "peers"]);

	const handleNavBack = useCallback(() => {
		if (onNavBack) onNavBack();

		if (
			outbound?.status === "requested" &&
			onCancel &&
			outbound?.to?.endpointId
		)
			onCancel(outbound?.to?.endpointId);
	}, [outbound]);

	const statusText = useMemo(() => {
		switch (status) {
			case "idle":
				return "";
			case "done":
				return t("peers:status_done");
			case "transfering":
				return t("peers:status_sharing");
			case "fail":
				return t("peers:status_failed");
			case "importing":
				return t("peers:status_importing");
			case "requested":
				return t("peers:status_waiting");
			case "rejected":
				return t("peers:status_rejected");
			case "cancelled":
				return t("peers:status_cancelled");
			case "timeout":
				return t("peers:status_timeout");
		}
	}, [status, peer]);

	const renderStatusIndicator = () => {
		if (outbound?.status === "transfering")
			return (
				<motion.p className="w-8 text-center text-xs tabular-nums opacity-80">
					{progressText}
				</motion.p>
			);
		if (outbound?.status === "requested")
			return <Spinner className="h-4 w-4" />;
		if (outbound?.status === "rejected" || outbound?.status === "fail")
			return (
				<HeroIcon
					name="x-circle"
					className="h-5 w-5 text-red-500 dark:text-red-400"
					iconStyle="solid"
				/>
			);

		if (outbound?.status === "timeout")
			return (
				<HeroIcon
					name="clock"
					className="h-5 w-5 text-amber-400 dark:text-amber-300"
					iconStyle="solid"
				/>
			);

		if (outbound?.status === "done")
			return (
				<HeroIcon
					name="check-circle"
					className="h-5 w-5 text-green-500 dark:text-green-400"
					iconStyle="solid"
				/>
			);

		return null;
	};

	useEffect(() => {
		progress.set(transferProgress);
	}, [transferProgress]);

	useEffect(() => {
		if (outbound?.status === "done") {
			const timer = setTimeout(() => {
				if (onDone) onDone();
			}, 800);

			return () => clearTimeout(timer);
		}

		if (
			outbound?.status === "rejected" ||
			outbound?.status === "fail" ||
			outbound?.status === "timeout"
		) {
			const timer = setTimeout(() => {
				if (onNavBack) onNavBack();
			}, 800);

			return () => clearTimeout(timer);
		}
	}, [outbound?.status]);

	return (
		<div className="flex h-full w-full flex-col items-center justify-center gap-y-4">
			<Button
				variant="ghost"
				onClick={handleNavBack}
				className="absolute top-4 left-2 h-8 w-8 rounded-full p-0! hover:bg-secondary"
			>
				<HeroIcon name="chevron-left" className="-ml-0.5" />
			</Button>
			<div className="h-20 w-20 overflow-hidden">
				<motion.div className="h-20 w-20">
					<DicebearAvatar seed={peer.endpointId} className="h-full w-full" />
				</motion.div>
			</div>
			<div className="flex flex-col items-center">
				<p className="line-clamp-1 font-medium">
					{t("share:sharing_with", { peer: peer.name })}
				</p>
				{parcel && (
					<p className="w-2/3 text-center text-muted text-sm">
						{t("share:sharing_description", {
							count: parcel.totalFiles,
							size: humanReadableSize(parcel.size || 0),
						})}
					</p>
				)}
			</div>
			<div
				className={cn(
					"relative flex h-6 flex-row items-center space-x-2 overflow-hidden",
					outbound?.status === "transfering" && "space-x-1",
				)}
			>
				<AnimatePresence initial={false} mode="popLayout">
					{outbound?.status !== "idle" &&
						outbound?.status !== "importing" &&
						outbound?.status !== "cancelled" && (
							<motion.div
								key={`status-indicator-${status}`}
								layout="position"
								initial={{ opacity: 0, scale: 0.5, filter: "blur(2px)" }}
								animate={{ opacity: 1, scale: 1, filter: "blur(0px)" }}
								exit={{ opacity: 0, scale: 0.5, filter: "blur(2px)" }}
								className={cn(
									"flex h-5 w-5 items-center justify-center",
									outbound?.status === "transfering" && "w-8",
								)}
							>
								{renderStatusIndicator()}
							</motion.div>
						)}
					<motion.p
						key={`status-text-${status}`}
						layout="position"
						className="text-foreground"
						initial={{ opacity: 0, y: -16 }}
						animate={{ opacity: 1, y: 0 }}
						exit={{ opacity: 0, y: 16 }}
					>
						{statusText}
					</motion.p>
				</AnimatePresence>
			</div>
			<div className="h-4 w-full">
				{outbound?.status === "transfering" && (
					<ProgressBar progress={progress} className="w-2/3" />
				)}
			</div>
			<Button
				onClick={onDone}
				className="h-7 rounded-full py-0 active:scale-[0.96]"
				variant="secondary"
			>
				{t("done")}
			</Button>
		</div>
	);
};
