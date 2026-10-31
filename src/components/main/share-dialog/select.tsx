import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import dayjs from "dayjs";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { HeroIcon } from "@/components/hero-icon";
import { Button } from "@/components/ui/button";
import { DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Spinner } from "@/components/ui/spinner";
import { type Parcel, useRecentParcels } from "@/lib/store/parcels";
import { humanReadableSize } from "@/lib/utils";

export type SelectSectionProps = {
	connecting?: boolean;
	onDone(): void;
	onSelectParcel?: (parcel: Parcel) => void;
	onImport?: (importingParcelId: number, totalFiles: number) => void;
};

type ParcelItemProps = {
	parcel: Parcel;
	connecting?: boolean;
	selected?: boolean;
	onSelect?: (parcel: Parcel) => void;
};

export const SelectSection = ({
	connecting = false,
	onDone,
	onImport,
	onSelectParcel,
}: SelectSectionProps) => {
	const [selectedParcel, setSelectedParcel] = useState<number | null>(null);
	const { t } = useTranslation(["common", "share", "parcels"]);

	console.log("SELECTED PARCEL", selectedParcel);

	const recentParcels = useRecentParcels(5);

	const selectFiles = async () => {
		try {
			const files = await open({ multiple: true });
			if (!files?.length) return;

			const parcel = await invoke<Parcel>("import", { files });
			if (onImport) onImport(parcel.id, parcel.totalFiles || files.length);
		} catch (e) {
			console.log(JSON.stringify(e));
		}
	};

	const handleSelectParcel = (parcel: Parcel) => {
		if (connecting) return;
		onSelectParcel?.(parcel);

		setSelectedParcel(parcel.id);
	};

	useEffect(() => {
		return () => {
			setSelectedParcel(null);
		};
	}, []);

	return (
		<div className="flex h-full w-full flex-col">
			<div className="flex w-full shrink-0 items-center gap-x-4 border-border-inv/5 border-b-[0.5px] p-4 dark:border-border">
				<div className="flex-1">
					<DialogTitle className="line-clamp-1">
						{t("share_dialog_title", { ns: "share" })}
					</DialogTitle>
					<DialogDescription className="line-clamp-2">
						{t("share_dialog_description", { ns: "share" })}
					</DialogDescription>
				</div>
				<div className="shrink-0">
					<Button
						className="rounded-full active:scale-[0.96]"
						variant="secondary"
						onClick={selectFiles}
					>
						<HeroIcon name="folder" iconStyle="micro" />{" "}
						{t("action_select_files")}
					</Button>
				</div>
			</div>
			<ScrollArea className="flex-1 overflow-y-scroll">
				<div className="mb-2 p-4 pb-0">
					<p className="text-muted">{t("recent_parcels", { ns: "parcels" })}</p>
				</div>
				<ol className="gap-y-4 px-2">
					{recentParcels.map((parcel) => (
						<ParcelItem
							key={`nsd-parcel-${parcel.id}`}
							parcel={parcel}
							connecting={connecting}
							selected={selectedParcel === parcel.id}
							onSelect={handleSelectParcel}
						/>
					))}
				</ol>
			</ScrollArea>
			<div className="flex h-12 w-full shrink-0 items-center justify-end border-border-inv/5 border-t-[0.5px] p-4 dark:border-border">
				<Button
					onClick={onDone}
					className="h-7 rounded-full py-0 active:scale-[0.96]"
					variant="secondary"
				>
					{t("done")}
				</Button>
			</div>
		</div>
	);
};

const ParcelItem = ({
	parcel,
	connecting,
	selected,
	onSelect,
}: ParcelItemProps) => {
	const { t } = useTranslation(["common", "parcels"]);

	const humanReadable = humanReadableSize(parcel.size || 0);
	const timeFromNow = dayjs(parcel.date).fromNow();

	const handleSelect = () => {
		if (onSelect) onSelect(parcel);
	};

	return (
		<li className="w-full">
			<Button
				variant="ghost"
				className="h-14 w-full items-center justify-between p-0 px-2 text-start hover:bg-secondary/60"
				disabled={connecting}
				onClick={handleSelect}
			>
				<div className="flex flex-1 flex-col items-start">
					<p>{t("parcel_name", { id: parcel.id, ns: "parcels" })}</p>
					<span className="text-muted text-sm">
						{t("files_count", { count: parcel.totalFiles })} · {humanReadable} ·{" "}
						{timeFromNow}
					</span>
				</div>
				{selected && connecting ? (
					<Spinner className="h-4 w-4" />
				) : (
					<HeroIcon
						name="chevron-right"
						iconStyle="mini"
						className="shrink-0 text-muted"
					/>
				)}
			</Button>
		</li>
	);
};
