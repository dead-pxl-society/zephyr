import { useTranslation } from "react-i18next";
import { Section, SectionTitle } from "@/components/settings/section";
import {
	Setting,
	SettingDescription,
	SettingsAction,
	SettingsGroup,
	SettingTitle,
} from "@/components/settings/setting";
import { ShortcutRecorder } from "@/components/settings/shortcut-recorder";
import { useShortcutConfig } from "@/lib/hooks/use-shortcut-config";

export const ShortcutsPage = () => {
	const { shortcuts, updateShortcut } = useShortcutConfig();

	const { t } = useTranslation(["navigation", "common", "share"]);

	return (
		<div className="flex h-full w-full justify-center">
			<Section>
				<SectionTitle>{t("settings:shortcuts_global_section")}</SectionTitle>
				<SettingsGroup>
					<Setting>
						<SettingTitle>{t("common:share")}</SettingTitle>
						<SettingDescription>
							{t("share:shortcut_share_description")}
						</SettingDescription>
						<SettingsAction>
							<ShortcutRecorder
								value={shortcuts?.share || ""}
								onChange={(s) => updateShortcut("share", s)}
							/>
						</SettingsAction>
					</Setting>
					<Setting>
						<SettingTitle>{t("common:receive")}</SettingTitle>
						<SettingDescription>
							{t("share:shortcut_receive_description")}
						</SettingDescription>
						<SettingsAction>
							<ShortcutRecorder
								value={shortcuts?.receive || ""}
								onChange={(s) => updateShortcut("receive", s)}
							/>
						</SettingsAction>
					</Setting>
					<Setting>
						<SettingTitle>{t("common:accept")}</SettingTitle>
						<SettingDescription>
							{t("share:shortcut_accept_description")}
						</SettingDescription>
						<SettingsAction>
							<ShortcutRecorder
								value={shortcuts?.accept || ""}
								onChange={(s) => updateShortcut("accept", s)}
							/>
						</SettingsAction>
					</Setting>
					<Setting>
						<SettingTitle>{t("common:reject")}</SettingTitle>
						<SettingDescription>
							{t("share:shortcut_reject_description")}
						</SettingDescription>
						<SettingsAction>
							<ShortcutRecorder
								value={shortcuts?.reject || ""}
								onChange={(s) => updateShortcut("reject", s)}
							/>
						</SettingsAction>
					</Setting>
				</SettingsGroup>
			</Section>
		</div>
	);
};
