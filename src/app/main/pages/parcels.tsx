import { invoke } from "@tauri-apps/api/core";
import { emit } from "@tauri-apps/api/event";
import { useSetAtom } from "jotai";
import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { HolographicEmpty } from "@/components/holographic-empty";
import {
	FilesDialog,
	type FilesDialogHandle,
} from "@/components/main/files-dialog";
import { createColumns } from "@/components/main/parcel-columns";
import { DataTable } from "@/components/main/table";
import { shareDialogAtom } from "@/lib/store/jotai";
import { type Parcel, useParcels } from "@/lib/store/parcels";

export const ParcelPage = () => {
	const [selectedParcel, setSelectedParcel] = useState<Parcel | null>(null);

	const setShareDialogData = useSetAtom(shareDialogAtom);

	const parcels = useParcels();
	const filesDialogRef = useRef<FilesDialogHandle>(null);

	const { t } = useTranslation(["common", "parcels"]);

	const onShare = (parcel: Parcel) => {
		setShareDialogData({ visible: true, data: { parcel } });
	};

	const onDisplayFiles = (parcel: Parcel) => {
		if (!filesDialogRef.current) return;

		setSelectedParcel(parcel);
		filesDialogRef.current.present();
	};

	const onDeleteParcel = (id: number) => {
		emit("ui:delete_parcel", id);
		invoke("delete_imported_tag", { parcelId: id });
	};

	const columns = createColumns(t, { onShare, onDisplayFiles, onDeleteParcel });

	return (
		<div className="w-full pt-16">
			<section>
				{parcels.length > 0 ? (
					<>
						<h2 className="mb-4 ml-2 font-bold text-xl">
							{t("parcels_title", { ns: "parcels" })}
						</h2>
						<div className="px-2">
							<DataTable columns={columns} data={parcels} />
						</div>
					</>
				) : (
					<HolographicEmpty
						geometry="parcel"
						title={t("empty_parcels_title", { ns: "parcels" })}
						description={t("empty_parcels_description", { ns: "parcels" })}
					/>
				)}
			</section>
			<FilesDialog
				ref={filesDialogRef}
				title={t("parcels:parcel_files_title")}
				description={t("parcels:parcel_files_description", {
					id: selectedParcel?.id || 0,
				})}
				parcelFiles={selectedParcel?.files}
			/>
		</div>
	);
};
