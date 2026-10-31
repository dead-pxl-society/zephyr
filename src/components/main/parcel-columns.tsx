import type { ColumnDef } from "@tanstack/react-table";
import { writeText } from "@tauri-apps/plugin-clipboard-manager";
import dayjs from "dayjs";
import type { TFunction } from "i18next";
import { motion } from "motion/react";
import { toast } from "sonner";
import { HeroIcon } from "@/components/hero-icon";
import { Button } from "@/components/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { Parcel } from "@/lib/store/parcels";
import { humanReadableSize } from "@/lib/utils";

interface ParcelTableActions {
	onShare: (parcel: Parcel) => void;
	onDisplayFiles: (parcel: Parcel) => void;
	onDeleteParcel: (id: number) => void;
}

export const createColumns = (
	t: TFunction,
	actions: ParcelTableActions,
): ColumnDef<Parcel>[] => [
	{
		accessorKey: "id",
		header: "ID",
	},
	{
		accessorKey: "size",
		header: t("size_column"),
		cell: ({ row }) => {
			const humanReadable = humanReadableSize(row.getValue("size"));
			return <div>{humanReadable}</div>;
		},
	},
	{
		accessorKey: "totalFiles",
		header: () => <div className="pl-2">{t("files_column")}</div>,
		cell: ({ row }) => {
			const parcel = row.original;
			const count: number = row.getValue("totalFiles");

			const handleDisplayFiles = () => {
				actions.onDisplayFiles(parcel);
			};

			return (
				<Button
					variant="ghost"
					className="h-8 px-2 hover:bg-background-popup active:scale-[0.97]"
					onClick={handleDisplayFiles}
				>
					{t("files_count", { count })}
				</Button>
			);
		},
	},
	{
		accessorKey: "date",
		header: () => <div className="text-right">{t("date_column")}</div>,
		cell: ({ row }) => {
			const timeFromNow = dayjs(row.getValue("date")).fromNow();
			return <div className="text-right">{timeFromNow}</div>;
		},
	},
	{
		id: "actions",
		cell: ({ row }) => {
			const parcel = row.original;

			const handleShare = () => {
				actions.onShare(parcel);
			};

			const handleDisplayFiles = () => {
				actions.onDisplayFiles(parcel);
			};

			const handleDeleteParcel = () => {
				actions.onDeleteParcel(parcel.id);
			};

			const handleCopy = async () => {
				try {
					await writeText(parcel.ticket || "");
					toast.success(t("common:ticket_copied"));
				} catch (_e) {
					toast.error(t("errors:ticket_copy"));
				}
			};

			return (
				<div className="flex flex-row items-center justify-end">
					<motion.div whileHover="hover">
						<Button
							variant="ghost"
							className="h-8 hover:bg-background-popup active:scale-[0.97] rounded-full"
							onClick={handleShare}
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
							{t("send")}
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
							<DropdownMenuLabel>{t("actions_section")}</DropdownMenuLabel>
							<DropdownMenuItem
								className="hover:bg-black/10! dark:hover:bg-white/10!"
								onClick={handleCopy}
							>
								<HeroIcon name="ticket" className="h-4 w-4 text-foreground" />{" "}
								{t("action_copy_ticket", { ns: "parcels" })}
							</DropdownMenuItem>
							<DropdownMenuItem
								className="hover:bg-black/10! dark:hover:bg-white/10!"
								onClick={handleDisplayFiles}
							>
								<HeroIcon
									name="document-text"
									className="h-4 w-4 text-foreground"
								/>
								{t("action_view_files", { ns: "parcels" })}
							</DropdownMenuItem>
							<DropdownMenuSeparator />
							<DropdownMenuItem
								variant="destructive"
								onClick={handleDeleteParcel}
							>
								<HeroIcon name="trash" className="h-4 w-4" />
								{t("delete")}
							</DropdownMenuItem>
						</DropdownMenuContent>
					</DropdownMenu>
				</div>
			);
		},
	},
];
