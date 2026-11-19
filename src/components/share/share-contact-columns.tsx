import type { ColumnDef } from "@tanstack/react-table";
import { motion } from "motion/react";
import { useTranslation } from "react-i18next";
import {
	transferKey,
	useOutboundTransfer,
	useTransferProgress,
} from "@/lib/store/transfers";
import { cn } from "@/lib/utils";
import type { Peer } from "@/type";
import { DicebearAvatar } from "../dicebear-avatar";
import { HeroIcon } from "../hero-icon";
import { getPlatformMeta } from "../main/contact-columns";
import { PlatformIcon } from "../platform-icon";

const ContactSendStatus = ({
	peer,
	parcelId,
}: {
	peer: Peer;
	parcelId?: number;
}) => {
	const { t } = useTranslation(["common", "peers"]);

	const key = parcelId != null ? transferKey(parcelId, peer.endpointId) : null;
	const outbound = useOutboundTransfer(key);
	const progress = useTransferProgress(key);
	const status = outbound?.status || "idle";

	if (status === "idle")
		return (
			<motion.div
				key={`transfer-status-${status}`}
				className="ml-auto flex h-6 w-fit flex-row items-center gap-x-1.5 rounded-full px-2 text-foreground group-hover:bg-black/10 dark:group-hover:bg-white/10"
				initial={{
					opacity: 0,
					transform: "translateY(-12px)",
					filter: "blur(2px)",
				}}
				animate={{
					opacity: 1,
					transform: "translateY(0px)",
					filter: "blur(0px)",
				}}
				exit={{
					opacity: 0,
					transform: "translateY(12px)",
					filter: "blur(2px)",
				}}
			>
				<HeroIcon
					name="send"
					className="h-4 w-4 transition-transform group-hover:-rotate-35"
					iconStyle="micro"
				/>
				<span>{t("common:action_send_files")}</span>
			</motion.div>
		);

	const statusText = () => {
		switch (status) {
			case "done":
				return t("peers:status_done");
			case "transfering":
				return `${Math.floor((progress || 0) * 100)}%`;
			case "fail":
				return t("peers:status_failed");
			case "importing":
				return t("peers:status_importing");
			case "connecting":
				return t("peers:status_connecting");
			case "requested":
				return t("peers:status_waiting");
			case "rejected":
				return t("peers:status_rejected");
			case "cancelled":
				return t("peers:status_cancelled");
			case "timeout":
				return t("peers:status_timeout");
		}
	};

	return (
		<motion.div
			key={`transfer-status-${status}`}
			className={cn(
				"text-right text-foreground tabular-nums",
				status === "transfering" && "font-mono",
			)}
			initial={{
				opacity: 0,
				transform: "translateY(-12px)",
				filter: "blur(2px)",
			}}
			animate={{
				opacity: 1,
				transform: "translateY(0px)",
				filter: "blur(0px)",
			}}
			exit={{ opacity: 0, transform: "translateY(12px)", filter: "blur(2px)" }}
		>
			{statusText()}
		</motion.div>
	);
};

export const createShareContactColumns = (
	parcelId?: number,
): ColumnDef<Peer>[] => [
	{
		accessorKey: "name",
		cell: ({ row }) => {
			const meta = getPlatformMeta(row.original.platform);
			return (
				<div className="flex flex-row items-center gap-x-2">
					<div className="relative flex h-6 w-6 shrink-0 items-center justify-center">
						<DicebearAvatar
							seed={row.original.endpointId}
							className="h-6 w-6"
						/>
						{meta.icon && (
							<PlatformIcon name={meta.icon} className="absolute h-3 w-3" />
						)}
					</div>
					{row.getValue("name")}
				</div>
			);
		},
	},
	{
		id: "send",
		cell: ({ row }) => (
			<ContactSendStatus peer={row.original} parcelId={parcelId} />
		),
	},
];
