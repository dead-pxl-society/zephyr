import type { ColumnDef } from "@tanstack/react-table";
import type { TFunction } from "i18next";
import { motion } from "motion/react";
import type { Peer, Platform, TrustLevel } from "@/type";
import { DicebearAvatar } from "../dicebear-avatar";
import { HeroIcon } from "../hero-icon";
import { LucideIcon } from "../lucide-icon";
import { PlatformIcon, type PlatformIconName } from "../platform-icon";
import { Button } from "../ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "../ui/dropdown-menu";

type ContactTableActions = {
	onSend(peer: Peer): void;
	onRemoveContact(dbId: string): void;
	onToggleTrust(dbId: string, current: TrustLevel): void;
	onAddToPersonal?: (peer: Peer) => Promise<void>;
};

export type PlatformMeta = {
	label: string;
	icon: PlatformIconName;
};

export const platformMap: Record<Platform, PlatformMeta> = {
	macos: {
		label: "macOS",
		icon: "apple",
	},
	windows: {
		label: "Windows",
		icon: "windows",
	},
	linux: {
		label: "Linux",
		icon: "linux",
	},
	android: {
		label: "Android",
		icon: "android",
	},
	ios: {
		label: "iOS",
		icon: "apple",
	},
	other: {
		label: "Unknown",
		icon: "",
	},
};

export const createColumns = (
	t: TFunction,
	actions: ContactTableActions,
): ColumnDef<Peer>[] => [
	{
		accessorKey: "name",
		header: t("common:name"),
		cell: ({ row }) => {
			const peer = row.original;
			return (
				<div className="flex flex-row items-center gap-x-2">
					<DicebearAvatar seed={peer.endpointId} className="h-6 w-6" />
					{row.getValue("name")}
				</div>
			);
		},
	},
	{
		accessorKey: "platform",
		header: () => <div className="text-right">{t("common:platform")}</div>,
		cell: ({ row }) => {
			const platform: Platform = row.getValue("platform");
			const meta = platformMap[platform];
			return (
				<div className="flex flex-row items-center justify-end gap-x-2">
					<PlatformIcon name={meta.icon} className="h-4 w-4" />
					<span>{meta.label}</span>
				</div>
			);
		},
	},
	{
		id: "actions",
		cell: ({ row }) => {
			const peer = row.original;

			const handleSend = () => {
				actions.onSend(peer);
			};

			const handleAddToPersonal = () => {
				actions.onAddToPersonal?.(peer);
			};

			const handleRemove = () => {
				actions.onRemoveContact(peer.id);
			};

			const handleToggleTrust = () => {
				actions.onToggleTrust(peer.id, peer.trustLevel);
			};

			return (
				<div className="flex flex-row items-center justify-end">
					<motion.div whileHover="hover">
						<Button
							variant="ghost"
							className="h-8 rounded-full hover:bg-background-popup active:scale-[0.97]"
							onClick={handleSend}
						>
							<span className="sr-only">
								{t("sr_send_parcel", { ns: "parcels" })}
							</span>
							<motion.span
								initial={{ transform: "rotate(0deg)" }}
								variants={{ hover: { transform: "rotate(-35deg)" } }}
								transition={{ duration: 0.16 }}
							>
								<HeroIcon name="send" className="h-4 w-4" iconStyle="micro" />
							</motion.span>
							{t("common:action_send_files")}
						</Button>
					</motion.div>
					<DropdownMenu>
						<DropdownMenuTrigger asChild>
							<Button
								variant="ghost"
								className="h-8 w-8 rounded-full p-0 hover:bg-background-popup"
							>
								<span className="sr-only">{t("sr_open_menu")}</span>
								<HeroIcon name="ellipsis-horizontal" className="h-4 w-4" />
							</Button>
						</DropdownMenuTrigger>
						<DropdownMenuContent align="end">
							<DropdownMenuLabel>
								{t("common:actions_section")}
							</DropdownMenuLabel>
							<DropdownMenuItem
								className="hover:bg-black/10! dark:hover:bg-white/10!"
								onClick={handleToggleTrust}
							>
								<LucideIcon
									name={
										peer.trustLevel === "trusted"
											? "shield-off"
											: "shield-check"
									}
									className="h-4 w-4 text-foreground"
								/>{" "}
								{peer.trustLevel === "trusted"
									? t("peers:action_revoke_trust")
									: t("peers:action_trust")}
							</DropdownMenuItem>
							<DropdownMenuItem
								className="hover:bg-black/10! dark:hover:bg-white/10!"
								onClick={handleAddToPersonal}
							>
								<LucideIcon
									name="monitor-smartphone"
									className="h-4 w-4 text-foreground"
								/>{" "}
								{t("peers:action_add_as_personal")}
							</DropdownMenuItem>
							<DropdownMenuSeparator />
							<DropdownMenuItem variant="destructive" onClick={handleRemove}>
								<HeroIcon name="trash" className="h-4 w-4" />
								{t("common:delete")}
							</DropdownMenuItem>
						</DropdownMenuContent>
					</DropdownMenu>
				</div>
			);
		},
	},
];
