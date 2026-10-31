import { AnimatePresence, motion, type Variants } from "motion/react";
import {
	type MouseEvent,
	type MouseEventHandler,
	useCallback,
	useMemo,
} from "react";
import { useTranslation } from "react-i18next";
import { getAvatarColor } from "@/lib/hooks/use-avatar";
import {
	transferKey,
	useOutboundTransfer,
	useTransferProgress,
} from "@/lib/store/transfers";
import type { EphemeralPeer, PeerStatus } from "@/type";
import { DicebearAvatar } from "../dicebear-avatar";
import { HeroIcon } from "../hero-icon";
import { LucideIcon } from "../lucide-icon";
import { CheckIcon } from "./check-icon";

type PeerCardProps = {
	ephemeral: EphemeralPeer;
	parcelId?: number;
	status?: PeerStatus;
	onClick?: (event: MouseEvent<HTMLButtonElement>) => void;
	onCancel?: () => void;
};

const avatarContentVariants: Variants = {
	hidden: {
		opacity: 0,
		filter: "blur(4px)",
		transform: "scale(0.5)",
	},
	visible: {
		opacity: 1,
		filter: "blur(0px)",
		transform: "scale(1)",
	},
};

export const PeerCard = ({
	ephemeral,
	parcelId,
	onClick,
	onCancel,
}: PeerCardProps) => {
	const key =
		parcelId != null ? transferKey(parcelId, ephemeral.endpointId) : null;
	const outbound = useOutboundTransfer(key);
	const progress = useTransferProgress(key);
	const status = outbound?.status || "idle";

	const { t } = useTranslation("peers");

	const peerName = useMemo(() => {
		if (ephemeral.peer?.name) return ephemeral.peer.name;
		const lastFour = ephemeral.endpointId.slice(-4);

		return t("peer_default_name", { id: lastFour });
	}, [status, ephemeral.peer]);

	const handleClick: MouseEventHandler<HTMLButtonElement> = useCallback(
		(e) => {
			if (
				status === "connecting" ||
				status === "importing" ||
				status === "transfering" ||
				status === "done"
			)
				return;

			if (status === "requested" && onCancel) {
				onCancel();
				return;
			}

			if (onClick) onClick(e);
		},
		[status],
	);

	const avatarColor = getAvatarColor(ephemeral.endpointId);

	const renderAvatarContent = useCallback(() => {
		if (status === "transfering")
			return (
				<p className="w-12 font-bold font-mono text-[#161616] tabular-nums">
					{Math.floor((progress || 0) * 100)}
				</p>
			);

		if (status === "done")
			return (
				<div className="flex h-14 w-14 items-center justify-center rounded-full bg-[#161616]">
					<CheckIcon strokeColor="#eeeeee" />
				</div>
			);

		return null;
	}, [status, progress]);

	const renderKindIcon = () => {
		if (ephemeral.peer?.kind === "device")
			return (
				<LucideIcon
					name="monitor-smartphone"
					className="h-4 w-4"
					style={avatarColor ? { color: avatarColor } : undefined}
				/>
			);

		if (ephemeral.peer?.kind === "contact")
			return (
				<HeroIcon
					name="users"
					className="h-4 w-4"
					iconStyle="mini"
					style={avatarColor ? { color: avatarColor } : undefined}
				/>
			);

		return (
			<HeroIcon
				name="signal"
				className="h-4 w-4"
				iconStyle="mini"
				style={avatarColor ? { color: avatarColor } : undefined}
			/>
		);
	};

	const formatPlatform = useCallback(() => {
		switch (ephemeral.peer?.platform) {
			case "windows":
				return "Windows";
			case "macos":
				return "macOS";
			case "android":
				return "Android";
			case "ios":
				return "iOS";
			case "linux":
				return "Linux";
			default:
				return "";
		}
	}, [ephemeral.peer]);

	const statusText = useMemo(() => {
		switch (status) {
			case "idle":
				return !ephemeral.peer?.platform ? "" : formatPlatform();
			case "done":
				return t("status_done");
			case "transfering":
				return t("status_sharing");
			case "fail":
				return t("status_failed");
			case "importing":
				return t("status_importing");
			case "connecting":
				return t("status_connecting");
			case "requested":
				return t("status_waiting");
			case "rejected":
				return t("status_rejected");
			case "cancelled":
				return t("status_cancelled");
			case "timeout":
				return t("status_timeout");
		}
	}, [status, ephemeral.peer]);

	return (
		<li className="relative h-[144px] w-32 overflow-hidden rounded-xl shadow-lg transition-all duration-150 hover:shadow-xl active:scale-[0.97] hover:[&_.bdrop]:opacity-100">
			<div
				className="pointer-events-none absolute top-1 right-1 flex h-6 w-6 items-center justify-center rounded-full"
				style={
					avatarColor ? { backgroundColor: `${avatarColor}33` } : undefined
				}
			>
				{renderKindIcon()}
			</div>
			<div
				className="pointer-events-none absolute inset-0 h-full w-full"
				style={{ filter: "url(#avatar-blur-bg)", transform: "scale(2)" }}
			>
				<DicebearAvatar seed={ephemeral.endpointId} className="h-full w-full" />
			</div>
			<div className="bdrop pointer-events-none absolute inset-0 rounded-xl bg-background-surface/20 opacity-50 mix-blend-plus-darker backdrop-blur-xl transition-opacity dark:mix-blend-plus-lighter" />
			<button
				className="flex h-full w-full flex-col items-center justify-between px-2 py-4 active:[&_.avatar]:scale-[0.97]"
				type="button"
				onClick={handleClick}
			>
				<div className="flex items-center justify-center">
					<DicebearAvatar
						seed={ephemeral.endpointId}
						className="avatar subtle-inner-border h-14 w-14 transition-transform duration-150"
					/>
					<AnimatePresence initial={false} mode="wait">
						<motion.div
							key={status}
							variants={avatarContentVariants}
							initial="hidden"
							animate="visible"
							exit="hidden"
							transition={{ duration: 0.25, type: "spring", bounce: 0.1 }}
							className="avatar absolute z-10 origin-center"
						>
							{renderAvatarContent()}
						</motion.div>
					</AnimatePresence>
				</div>
				<div className="overflow-hidden">
					<p className="subtle-inner-border text-center text-xs">{peerName}</p>
					<div className="mt-1 h-4 overflow-hidden">
						<AnimatePresence initial={false} mode="popLayout">
							<motion.p
								key={`status-text-${status}`}
								layout="position"
								className="text-center text-foreground/60 text-xs"
								initial={{ opacity: 0, y: -16, filter: "blur(2px)" }}
								animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
								exit={{ opacity: 0, y: 16, filter: "blur(2px)" }}
							>
								{statusText}
							</motion.p>
						</AnimatePresence>
					</div>
					{/*<AnimatePresence initial={false} mode="popLayout">
              <motion.p key={statusText} className="text-center text-muted text-xs" initial="initial" animate="animate" exit="exit" variants={statusVariants} transition={{ duration: 0.16 }}>{statusText}</motion.p>
            </AnimatePresence>*/}
				</div>
			</button>
		</li>
	);
};
