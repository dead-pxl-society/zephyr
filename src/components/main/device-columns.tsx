import type { ColumnDef } from "@tanstack/react-table";
import type { TFunction } from "i18next";
import { motion } from "motion/react";
import { cn } from "@/lib/utils";
import type { DeviceView } from "@/type";
import { DicebearAvatar } from "../dicebear-avatar";
import { HeroIcon } from "../hero-icon";
import { PlatformIcon } from "../platform-icon";
import { Button } from "../ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuTrigger,
} from "../ui/dropdown-menu";
import { getPlatformMeta } from "./contact-columns";

type DeviceTableActions = {
	onSend(device: DeviceView): void;
	onRemove(device: DeviceView): void;
};

export const createDeviceColumns = (
	t: TFunction,
	actions: DeviceTableActions,
): ColumnDef<DeviceView>[] => [
	{
		id: "name",
		accessorFn: (device) => device.peer.name,
		header: t("common:name"),
		cell: ({ row }) => {
			const { peer, online } = row.original;
			return (
				<div className="flex flex-row items-center gap-x-2">
					<div className="relative">
						<DicebearAvatar
							seed={peer.endpointId}
							className={cn("h-6 w-6", !online && "opacity-60")}
						/>
						<span
							className={cn(
								"absolute -right-0.5 -bottom-0.5 h-3 w-3 rounded-full border-2 border-background",
								online ? "bg-green-500" : "bg-zinc-600",
							)}
						>
							<span className="sr-only">
								{t(online ? "peers:device_online" : "peers:device_offline")}
							</span>
						</span>
					</div>
					{peer.name}
				</div>
			);
		},
	},
	{
		id: "platform",
		accessorFn: (device) => device.peer.platform,
		header: () => <div className="text-right">{t("common:platform")}</div>,
		cell: ({ row }) => {
			const meta = getPlatformMeta(row.original.peer.platform);
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
			const device = row.original;

			const handleSend = () => {
				actions.onSend(device);
			};

			const handleRemove = () => {
				actions.onRemove(device);
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
							<DropdownMenuItem variant="destructive" onClick={handleRemove}>
								<HeroIcon name="trash" className="h-4 w-4" />
								{t("peers:action_remove_device")}
							</DropdownMenuItem>
						</DropdownMenuContent>
					</DropdownMenu>
				</div>
			);
		},
	},
];
