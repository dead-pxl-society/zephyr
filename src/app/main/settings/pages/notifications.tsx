import { invoke } from "@tauri-apps/api/core";
import { emit } from "@tauri-apps/api/event";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
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
import { Switch } from "@/components/ui/switch";
import { useUser } from "@/lib/store/user";

export const NotificationsPage = () => {
	const user = useUser();
	const { t } = useTranslation([
		"settings",
		"notifications",
		"sounds",
		"errors",
	]);

	const handleToggle =
		(key: "notifications" | "sounds") => async (value: boolean) => {
			const patch = { [key]: value };

			try {
				await invoke("update_user_cmd", { id: user?.id, patch });
				emit("ui:update_user", patch);
			} catch (_e) {
				toast.error(t("errors:error_updating_preferences"));
			}
		};

	return (
		<div className="flex h-full w-full justify-center">
			<Section>
				<SectionTitle>{t("settings:notifications_section")}</SectionTitle>
				<SettingsGroup>
					<Setting>
						<SettingTitle>
							{t("notifications:enable_notifications")}
						</SettingTitle>
						<SettingDescription>
							{t("notifications:enable_notifications_description")}
						</SettingDescription>
						<SettingsAction>
							<Switch
								checked={user?.notifications ?? true}
								onCheckedChange={handleToggle("notifications")}
							/>
						</SettingsAction>
					</Setting>
				</SettingsGroup>
				<SectionDivider />
				<SectionTitle>{t("settings:sounds_section")}</SectionTitle>
				<SettingsGroup>
					<Setting>
						<SettingTitle>{t("sounds:sound_effects")}</SettingTitle>
						<SettingDescription>
							{t("sounds:sound_effects_description")}
						</SettingDescription>
						<SettingsAction>
							<Switch
								checked={user?.sounds ?? true}
								onCheckedChange={handleToggle("sounds")}
							/>
						</SettingsAction>
					</Setting>
				</SettingsGroup>
			</Section>
		</div>
	);
};
