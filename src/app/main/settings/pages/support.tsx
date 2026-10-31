import { getVersion } from "@tauri-apps/api/app";
import { openUrl } from "@tauri-apps/plugin-opener";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import {
	Section,
	SectionDivider,
	SectionTitle,
} from "@/components/settings/section";
import {
	Setting,
	SettingDescription,
	SettingsAction,
	SettingTitle,
} from "@/components/settings/setting";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { useUpdater } from "@/lib/hooks/use-updater";
import { useUpdaterStore } from "@/lib/store/updater";

export const SupportPage = () => {
	const { t } = useTranslation();

	const [version, setVersion] = useState<string | null>(null);

	const { checkNow } = useUpdater({ enabled: false });
	const status = useUpdaterStore((s) => s.status);
	const updateVersion = useUpdaterStore((s) => s.version);
	const downloaded = useUpdaterStore((s) => s.downloaded);
	const total = useUpdaterStore((s) => s.total);
	const downloadAndInstall = useUpdaterStore((s) => s.downloadAndInstall);

	const busy =
		status === "checking" ||
		status === "downloading" ||
		status === "installing";

	const downloadPercent =
		total && total > 0
			? Math.min(100, Math.round((downloaded / total) * 100))
			: null;

	const describeUpdate = () => {
		if (
			status === "available" ||
			status === "downloading" ||
			status === "installing"
		)
			return t("updater:setting_update_available", { version: updateVersion });
		return version
			? t("updater:setting_description", { version })
			: t("updater:setting_description_loading");
	};

	const updateAction = () =>
		status === "available" ? downloadAndInstall() : checkNow();

	const updateLabel = () => {
		if (status === "installing") return t("updater:action_installing");
		if (status === "downloading")
			return downloadPercent === null
				? t("updater:action_downloading")
				: t("updater:action_downloading_percent", {
						percent: downloadPercent,
					});
		if (status === "checking") return t("updater:action_checking");
		if (status === "available")
			return t("updater:action_update_now", { version: updateVersion });
		return t("updater:action_check_now");
	};

	useEffect(() => {
		getVersion().then(setVersion);
	}, []);

	const openDiscordLink = () => {
		openUrl("https://discord.gg/E88TZXsPjN");
	};

	return (
		<div className="flex h-full w-full justify-center">
			<Section>
				<SectionTitle>{t("navigation:support")}</SectionTitle>
				<Setting className="gap-x-2">
					<SettingTitle>{t("settings:need_help_title")}</SettingTitle>
					<SettingDescription>
						{t("settings:need_help_description")}
					</SettingDescription>
					<SettingsAction>
						<Button
							className="rounded-full bg-[#7289da] text-white hover:bg-[#7289da]/80"
							onClick={openDiscordLink}
						>
							{t("settings:action_join_discord")}
						</Button>
					</SettingsAction>
				</Setting>

				<SectionDivider />

				<Setting className="gap-x-2">
					<SettingTitle>{t("updater:setting_title")}</SettingTitle>
					<SettingDescription>{describeUpdate()}</SettingDescription>
					<SettingsAction>
						<Button
							variant="ghost"
							className="rounded-full"
							disabled={busy}
							onClick={updateAction}
						>
							{busy && <Spinner />}
							{updateLabel()}
						</Button>
					</SettingsAction>
				</Setting>
			</Section>
		</div>
	);
};
