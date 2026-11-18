import {
	AnimatePresence,
	motion,
	useReducedMotion,
	type Variants,
} from "motion/react";
import {
	type MouseEvent,
	type MouseEventHandler,
	useCallback,
	useEffect,
	useMemo,
	useRef,
	useState,
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
import { DoneBadge } from "./done-badge";
import { PeerDoneBurst } from "./peer-done-burst";

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

	// Celebrate only the live transition into "done"; a card that mounts (or
	// remounts after the window is reopened) already done stays quiet.
	const reducedMotion = useReducedMotion();
	const prevStatus = useRef(status);
	const [celebrating, setCelebrating] = useState(false);

	useEffect(() => {
		const prev = prevStatus.current;
		prevStatus.current = status;

		if (status !== "done") setCelebrating(false);
		else if (prev !== "done") setCelebrating(true);
	}, [status]);

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
				<DoneBadge
					seed={ephemeral.endpointId}
					color={avatarColor}
					animated={celebrating && !reducedMotion}
				/>
			);

		return null;
	}, [status, progress, celebrating, reducedMotion, avatarColor]);

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
			{celebrating && status === "done" && (
				<PeerDoneBurst
					color={avatarColor}
					reduced={!!reducedMotion}
					onFinished={() => setCelebrating(false)}
				/>
			)}
			<button
				className="flex h-full w-full flex-col items-center justify-between px-2 py-4 active:[&_.avatar]:scale-[0.97]"
				type="button"
				onClick={handleClick}
			>
				<motion.div
					className="flex items-center justify-center"
					animate={
						celebrating && !reducedMotion
							? { transform: ["scale(1)", "scale(1.1)", "scale(1)"] }
							: undefined
					}
					transition={{
						duration: 0.5,
						times: [0, 0.3, 1],
						// Quick swell, then a back-out settle that dips just under 1:
						// a small element needs the overshoot for the pop to read.
						ease: [
							[0.25, 0.46, 0.45, 0.94],
							[0.34, 1.56, 0.64, 1],
						],
					}}
				>
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
				</motion.div>
				<div className="overflow-hidden">
					{/* Positioned so it paints above the background layers (the done
					    glow included) like the avatar and status text already do. */}
					<p className="subtle-inner-border relative text-center text-xs">
						{peerName}
					</p>
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
