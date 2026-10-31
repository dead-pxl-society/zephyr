import { useSpring } from "motion/react";
import { useEffect, useMemo } from "react";
import { useTranslation } from "react-i18next";
import {
	type InboundTransfer,
	type OutboundTransfer,
	useTransferProgress,
} from "@/lib/store/transfers";
import { cn, humanReadableSize } from "@/lib/utils";
import { ProgressBar } from "../progress-bar";

type TransferCardProps =
	| {
			id: number;
			type: "inbound";
			transfer: InboundTransfer;
			gradientBackground?: boolean;
	  }
	| {
			id: string;
			type: "outbound";
			transfer: OutboundTransfer;
			gradientBackground?: boolean;
	  };

export const TransferCard = ({
	transfer,
	type,
	id,
	gradientBackground = false,
}: TransferCardProps) => {
	const { t } = useTranslation(["transfers", "peers"]);

	const isInbound = type === "inbound";
	const transferProgress = useTransferProgress(id);

	const progress = useSpring(0, {
		duration: 0.2,
		bounce: 0,
	});

	const peerName = useMemo(() => {
		if (type === "outbound" && transfer?.to?.name) return transfer.to.name;
		if (type === "inbound" && transfer?.from?.name) return transfer.from.name;

		if (type === "inbound" && transfer?.from?.endpointId) {
			const lastFour = transfer.from.endpointId.slice(-4);
			return t("peer_default_name", { id: lastFour, ns: "peers" });
		}
		if (type === "outbound" && transfer?.to?.endpointId) {
			const lastFour = transfer?.to?.endpointId.slice(-4);
			return t("peer_default_name", { id: lastFour, ns: "peers" });
		}
		return "";
	}, [transfer, type]);

	const renderTitle = () => {
		const data = {
			count: transfer.files,
			size: humanReadableSize(transfer.size || 0),
		};

		if (isInbound) return t("progress_receiving", data);

		if (transfer.status === "requested") return t("progress_requested", data);
		if (transfer.status === "timeout") return t("progress_timeout");
		if (transfer.status === "rejected") return t("progress_rejected");

		return t("progress_sending", data);
	};

	useEffect(() => {
		progress.set(transferProgress);
	}, [transferProgress]);

	return (
		<div
			className={cn(
				"edge-highlight flex h-24 w-[calc(50%-20px)] shrink-0 snap-start flex-col justify-between rounded-lg bg-background-popup p-2 pb-5 shadow-md dark:bg-background-top",
				gradientBackground &&
					"bg-linear-to-b/oklch from-50% from-background-popup to-[#EDFAFF] dark:from-background-top dark:to-[#001933]",
				gradientBackground && !isInbound && "to-[#EBFDF6] dark:to-[#002013]",
			)}
		>
			<div className="w-full">
				<p
					className={cn(
						"text-[#000206] dark:text-[#EDFAFF]",
						!isInbound && "text-[#000301] dark:text-[#EBFDF6]",
					)}
				>
					{renderTitle()}
				</p>

				{type === "outbound" && transfer.to && (
					<p className="line-clamp-1 text-[#000301]/70 text-sm dark:text-[#EBFDF6]/70">
						{t("to_peer", { peer: peerName })}
					</p>
				)}

				{type === "inbound" && transfer.from && (
					<p className="line-clamp-1 text-[#000206]/70 text-sm dark:text-[#EDFAFF]/70">
						{t("from_peer", {
							peer: peerName,
						})}
					</p>
				)}
			</div>
			<ProgressBar
				progress={progress}
				showPercentage
				className={cn(
					"h-2 rounded-md bg-[#D0E6FD] dark:bg-[#003871]",
					!isInbound && "bg-[#CDEBDE] dark:bg-[#00331F]",
				)}
				innerClassName={cn(
					"bg-[#0082DB] dark:bg-[#0082DB]",
					!isInbound && "bg-[#008759] dark:bg-[#009A6C]",
				)}
			/>
		</div>
	);
};
