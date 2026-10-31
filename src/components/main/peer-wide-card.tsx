import { invoke } from "@tauri-apps/api/core";
import { AnimatePresence, motion, type Transition } from "motion/react";
import {
	type CSSProperties,
	type ForwardedRef,
	forwardRef,
	useCallback,
	useEffect,
	useMemo,
	useState,
} from "react";
import { useTranslation } from "react-i18next";
import { usePeerStore } from "@/lib/store/peers";
import { queryClient } from "@/lib/store/react-query";
import { cn } from "@/lib/utils";
import type { Peer } from "@/type";
import { DicebearAvatar } from "../dicebear-avatar";
import { HeroIcon, type HeroIconName } from "../hero-icon";
import { LucideIcon } from "../lucide-icon";
import { Button, type ButtonProps } from "../ui/button";
import { Spinner } from "../ui/spinner";
import { PlatformBadge } from "./platform-badge";

export type PeerWideCardProps = {
	peer: Partial<Peer>;
	index: number;
	endpointId: string;
	selected?: boolean;
	onSelect?: (peer: Partial<Peer>) => void;
	onSendFiles?: () => void;
	onBlockPeer?: (peer: Partial<Peer>) => void;
};

type PeerCardActionStatus = "idle" | "processing" | "error" | "success";

type PeerCardActionProps = {
	iconName: HeroIconName;
	label: string;
	status?: PeerCardActionStatus;
} & ButtonProps;

const ADD_CONTACT_SUCCESS_MS = 1200;

const baseTransition: Transition = {
	duration: 0.27,
	ease: [0.25, 1, 0.5, 1],
	type: "spring",
};

export const PeerWideCard = forwardRef(
	(
		{
			peer,
			endpointId,
			index,
			selected,
			onSelect,
			onSendFiles,
			onBlockPeer,
		}: PeerWideCardProps,
		ref: ForwardedRef<HTMLDivElement>,
	) => {
		const [elevate, setElevate] = useState(selected);
		const [contactStatus, setContactStatus] =
			useState<PeerCardActionStatus>("idle");

		const { t } = useTranslation(["common", "peers"]);

		const handleSelect = useCallback(() => {
			if (!onSelect) return;
			onSelect(peer);
		}, [peer]);

		const addContactLabel = () => {
			if (contactStatus === "processing") return t("peers:adding_contact");
			if (contactStatus === "error") return t("peers:contact_failed");
			if (contactStatus === "success") return t("peers:contact_added");
			return t("peers:action_add_as_contact");
		};

		const onAddContact = async () => {
			const payload = peer.id ? { dbId: peer.id } : { endpointId };
			setContactStatus("processing");

			try {
				const updated = await invoke<Peer>("add_contact", payload);
				queryClient.invalidateQueries({ queryKey: ["contacts"] });
				setContactStatus("success");
				setTimeout(() => {
					usePeerStore.getState().setPeerData(endpointId, updated);
					setContactStatus("idle");
				}, ADD_CONTACT_SUCCESS_MS);
			} catch {
				setContactStatus("error");
				setTimeout(() => {
					setContactStatus("idle");
				}, 1000);
			}
		};

		const translateX = useMemo(() => {
			const pos = index % 3;
			if (pos === 0) return "-8px";
			if (pos === 1) return "0px";
			return "8px";
		}, [index]);

		const renderKindBadge = () => {
			if (peer.kind === "device")
				return (
					<div className="flex h-6 flex-row items-center justify-center gap-x-1 rounded-md bg-sky-400/20 px-2">
						<LucideIcon
							name="monitor-smartphone"
							className="h-4 w-4 text-sky-400"
						/>
						<p className="font-mono text-sky-400 text-xs">
							{t("peers:devices")}
						</p>
					</div>
				);

			if (peer.kind === "contact")
				return (
					<div className="flex h-6 flex-row items-center justify-center gap-x-1 rounded-md bg-green-400/20 px-2">
						<HeroIcon
							name="users"
							className="h-4 w-4 text-emerald-400"
							iconStyle="mini"
						/>
						<p className="font-mono text-emerald-400 text-xs">
							{t("peers:contacts")}
						</p>
					</div>
				);

			return (
				<div className="flex h-6 flex-row items-center justify-center gap-x-1 rounded-md bg-violet-400/20 px-2">
					<HeroIcon
						name="signal"
						className="h-4 w-4 text-violet-400"
						iconStyle="mini"
					/>
					<p className="font-mono text-violet-400 text-xs">
						{t("peers:nearby")}
					</p>
				</div>
			);
		};

		useEffect(() => {
			let timeout: number | null = null;
			if (!selected) {
				const currentSelected = selected;
				timeout = setTimeout(() => {
					setElevate(currentSelected);
				}, 320);
			} else {
				if (timeout) {
					clearTimeout(timeout);
					timeout = null;
				}
				setElevate(selected);
			}

			return () => {
				if (timeout) {
					clearTimeout(timeout);
					timeout = null;
				}
			};
		}, [selected]);

		return (
			<div key={peer.endpointId} ref={ref} className="relative h-[88px]">
				<div
					className={cn(
						"edge-highlight menu-item top-0 right-0 left-0 rounded-xl bg-background-popup dark:bg-background-top",
						elevate && "z-10",
						!selected && "shadow-md",
					)}
					style={
						{
							"--movex": translateX,
							borderBottomLeftRadius: selected ? "0px" : undefined,
							borderBottomRightRadius: selected ? "0px" : undefined,
						} as CSSProperties
					}
					data-active={`${selected}`}
				>
					<button
						className={cn(
							"z-10 w-full appearance-none space-y-2 rounded-xl border-0 bg-transparent p-2 text-left",
							selected && "shadow-lg",
						)}
						onClick={handleSelect}
						type="button"
						style={{
							borderBottomLeftRadius: "0px",
							borderBottomRightRadius: "0px",
						}}
					>
						<div className="flex w-full flex-row justify-between">
							<div className="flex w-full flex-row items-center gap-x-2">
								<DicebearAvatar
									seed={peer.endpointId || "sumseedforpeer"}
									className="h-10 w-10"
								/>
								<p className="line-clamp-2 max-w-[calc(100%-56px)] text-sm antialiased">
									{peer.name || peer.endpointId || ""}
								</p>
							</div>
						</div>
						<div className="flex flex-row gap-x-1">
							{renderKindBadge()}
							{peer.platform && <PlatformBadge platform={peer.platform} />}
						</div>
					</button>
					<div
						className="menu-content absolute w-full bg-background-popup pt-2 shadow-lg dark:bg-background-top"
						data-active={`${selected}`}
					>
						<div className="h-px w-full bg-border" />
						<div className="flex flex-col px-2 pb-2">
							{peer.trustLevel !== "blocked" && (
								<PeerCardAction
									iconName="send"
									label={t("action_send_files")}
									onClick={onSendFiles}
								/>
							)}
							{peer.kind === "stranger" && (
								<PeerCardAction
									iconName="user-plus"
									label={addContactLabel()}
									status={contactStatus}
									onClick={onAddContact}
								/>
							)}
							{peer.kind !== "device" && (
								<PeerCardAction
									iconName="no-symbol"
									label={t(
										peer.trustLevel !== "blocked"
											? "peers:action_block_peer"
											: "peers:action_unblock_peer",
									)}
									onClick={() => onBlockPeer?.(peer)}
								/>
							)}
						</div>
					</div>
				</div>
			</div>
		);
	},
);

const PeerCardAction = ({
	iconName,
	children,
	label,
	status = "idle",
	...buttonProps
}: PeerCardActionProps) => {
	const splitWords = () => {
		const words = label.trim().split(" ");
		const midPoint = words.length / 2;
		return words.map((word, index) => (
			<motion.span
				key={`fb-${word}`}
				layoutId={`fb-${word}`}
				layout="position"
				className="inline-block"
				transition={{
					...baseTransition,
					bounce: 0,
				}}
				initial={{
					opacity: 0,
					filter: "blur(2px)",
					transform:
						index >= midPoint ? "translateX(2rem)" : "translateX(-2rem)",
				}}
				animate={{
					opacity: 1,
					transform: "translateX(0)",
					filter: "blur(0px)",
				}}
				exit={{
					opacity: 0,
					filter: "blur(2px)",
					transform:
						index >= midPoint ? "translateX(2rem)" : "translateX(-2rem)",
				}}
			>
				{word}
			</motion.span>
		));
	};

	const renderIcon = () => {
		if (status === "processing") return <Spinner />;
		if (status === "success")
			return (
				<HeroIcon
					name="check-circle"
					className="h-5 w-5 text-green-400"
					iconStyle="mini"
				/>
			);

		if (status === "error")
			return (
				<HeroIcon
					name="x-circle"
					className="h-5 w-5 text-red-400"
					iconStyle="mini"
				/>
			);
		return (
			<HeroIcon
				name={iconName}
				className={cn("h-4 w-4", iconName === "send" && "-rotate-45")}
				iconStyle="mini"
			/>
		);
	};

	return (
		<Button
			variant="ghost"
			className="flex w-full hover:bg-background-surface dark:hover:bg-background-surface/60"
			{...buttonProps}
		>
			<div className="flex w-full items-center justify-center space-x-1">
				<AnimatePresence initial={false} mode="popLayout">
					<motion.div
						key={`icon-${status}`}
						initial={{ opacity: 0, transform: "scale(0.9)" }}
						animate={{ opacity: 1, transform: "scale(1)" }}
						exit={{ opacity: 0, transform: "scale(0.9)" }}
						transition={{
							...baseTransition,
							bounce: 0.1,
						}}
					>
						{renderIcon()}
					</motion.div>
				</AnimatePresence>
				{splitWords()}
			</div>
		</Button>
	);
};
