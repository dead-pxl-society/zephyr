import type { ColumnDef } from "@tanstack/react-table";
import dayjs from "dayjs";
import type { TFunction } from "i18next";
import { HeroIcon, type HeroIconName } from "@/components/hero-icon";
import { Button } from "@/components/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { StoredTransfer } from "@/lib/store/transfers";
import { cn, humanReadableSize } from "@/lib/utils";

interface TransferTableActions {
	onDelete: (id: string) => void;
	onDisplayFiles: (transfer: StoredTransfer) => void;
}

export const createColumns = (
	t: TFunction,
	actions: TransferTableActions,
): ColumnDef<StoredTransfer>[] => [
	{
		accessorKey: "kind",
		header: t("type_column"),
		cell: ({ row }) => {
			const kind: "inbound" | "outbound" = row.getValue("kind");
			const iconName: HeroIconName =
				kind === "inbound" ? "arrow-down-right" : "arrow-up-left";

			return (
				<div className="flex flex-row items-center gap-1">
					<HeroIcon
						className={cn(
							"h-4 w-4 text-[#0082DB] dark:text-[#0082DB]",
							kind === "outbound" && "text-[#008759] dark:text-[#009A6C]",
						)}
						iconStyle="micro"
						name={iconName}
					/>{" "}
					{t(kind === "inbound" ? "received" : "sent", { ns: "transfers" })}
				</div>
			);
		},
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
		header: t("files_column"),
		cell: ({ row }) => {
			const count: number = row.getValue("totalFiles");
			const transfer = row.original;

			const handleDisplayFiles = (e: React.MouseEvent) => {
				e.stopPropagation();
				actions.onDisplayFiles(transfer);
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
		accessorKey: "createdAt",
		header: () => <div className="text-right">{t("date_column")}</div>,
		cell: ({ row }) => {
			const timeFromNow = dayjs(row.getValue("createdAt")).fromNow();
			return <div className="text-right">{timeFromNow}</div>;
		},
	},
	{
		id: "actions",
		cell: ({ row }) => {
			const transfer = row.original;

			const handleDelete = (e: React.MouseEvent) => {
				e.stopPropagation();
				actions.onDelete(transfer.id);
			};

			const handleDisplayFiles = (e: React.MouseEvent) => {
				e.stopPropagation();
				actions.onDisplayFiles(transfer);
			};

			return (
				<div className="flex flex-row items-center justify-end">
					<DropdownMenu>
						<DropdownMenuTrigger asChild>
							<Button
								variant="ghost"
								className="h-8 w-8 rounded-full p-0 hover:bg-background-popup"
							>
								<span className="sr-only">{t("sr_open_menu")}</span>
								<HeroIcon name="ellipsis-vertical" className="h-4 w-4" />
							</Button>
						</DropdownMenuTrigger>
						<DropdownMenuContent align="end">
							<DropdownMenuLabel>{t("actions_section")}</DropdownMenuLabel>
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
							<DropdownMenuItem variant="destructive" onClick={handleDelete}>
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
