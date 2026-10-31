import { invoke } from "@tauri-apps/api/core";
import { emit } from "@tauri-apps/api/event";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { DeleteConfirmButton } from "@/components/settings/delete-confirm-button";
import {
	Section,
	SectionDivider,
	SectionTitle,
} from "@/components/settings/section";
import {
	Setting,
	SettingDescription,
	SettingsAction,
	SettingsGroup,
	SettingTitle,
} from "@/components/settings/setting";

import { queryClient } from "@/lib/store/react-query";

export const StoragePage = () => {
	const { t } = useTranslation([
		"navigation",
		"transfers",
		"peers",
		"parcels",
		"notifications",
		"errors",
	]);

	const deleteAllParcels = async () => {
		try {
			await invoke("delete_all_parcels");
			emit("ui:delete_all_parcels");
			toast.success(t("notifications:deleted_all_parcels"));
		} catch (_e) {
			toast.error(t("errors:error_deleting_parcels"));
		}
	};

	const deleteResumableTransfers = async () => {
		try {
			await invoke("delete_resumable_transfers");
			toast.success(t("notifications:deleted_resumable_transfers"));
		} catch (_e) {
			toast.error(t("errors:error_deleting_resumables"));
		}
	};

	const deleteStoredTransfers = async () => {
		try {
			await invoke("delete_all_transfers");
			queryClient.invalidateQueries({ queryKey: ["transfers"] });
			toast.success(t("notifications:deleted_stored_transfers"));
		} catch (_e) {
			toast.error(t("errors:error_deleting_transfers"));
		}
	};

	const deleteStrangers = async () => {
		try {
			await invoke("delete_stranger_peers");
			toast.success(t("notifications:deleted_peers"));
		} catch (_e) {
			toast.error(t("errors:error_deleting_peers"));
		}
	};

	return (
		<div className="flex h-full w-full justify-center">
			<Section>
				<SectionTitle>{t("settings:storage_data_section")}</SectionTitle>
				<SettingsGroup>
					<Setting>
						<SettingTitle>{t("navigation:transfers")}</SettingTitle>
						<SettingDescription>
							{t("transfers:storage_transfers_description")}
						</SettingDescription>
						<SettingsAction>
							<DeleteConfirmButton
								layoutKey="transfers"
								onDelete={deleteStoredTransfers}
							/>
						</SettingsAction>
					</Setting>
					<Setting>
						<SettingTitle>{t("navigation:discovered_peers")}</SettingTitle>
						<SettingDescription>
							{t("peers:storage_peers_description")}
						</SettingDescription>
						<SettingsAction>
							<DeleteConfirmButton
								layoutKey="peers"
								onDelete={deleteStrangers}
							/>
						</SettingsAction>
					</Setting>
					<Setting>
						<SettingTitle>{t("navigation:parcels")}</SettingTitle>
						<SettingDescription>
							{t("parcels:storage_parcels_description")}
						</SettingDescription>
						<SettingsAction>
							<DeleteConfirmButton
								layoutKey="parcels"
								onDelete={deleteAllParcels}
							/>
						</SettingsAction>
					</Setting>
				</SettingsGroup>
				<SectionDivider />
				<SectionTitle>{t("settings:storage_downloads_section")}</SectionTitle>
				<SettingsGroup>
					<Setting>
						<SettingTitle>{t("share:resumable_transfer_title")}</SettingTitle>
						<SettingDescription>
							{t("share:resumable_transfer_description")}
						</SettingDescription>
						<SettingsAction>
							<DeleteConfirmButton
								layoutKey="resumableTransfers"
								onDelete={deleteResumableTransfers}
							/>
						</SettingsAction>
					</Setting>
				</SettingsGroup>
			</Section>
		</div>
	);
};
