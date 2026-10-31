import { invoke } from "@tauri-apps/api/core";
import { emit } from "@tauri-apps/api/event";
import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { useDebouncedCallback } from "use-debounce";
import {
	Section,
	SectionDivider,
	SectionTitle,
} from "@/components/settings/section";
import {
	Setting,
	SettingsAction,
	SettingTitle,
} from "@/components/settings/setting";
import { Input } from "@/components/ui/input";
import {
	NativeSelect,
	NativeSelectOption,
} from "@/components/ui/native-select";
import { SUPPORTED_LANGUAGES } from "@/lib/i18n";
import { useUser } from "@/lib/store/user";

export const GeneralPage = () => {
	const user = useUser();
	const { t } = useTranslation(["peers", "common", "errors", "settings"]);
	const [localName, setLocalName] = useState(user?.name ?? "");

	const persistName = useDebouncedCallback(async (name: string) => {
		try {
			const patch = { name };
			await invoke("update_user_cmd", { id: user?.id, patch });
			emit("ui:update_user", patch);
		} catch (_e) {
			toast.error(t("errors:error_updating_display_name"));
		}
	}, 500);

	const handleDisplayNameChange = useCallback(
		(e: React.ChangeEvent<HTMLInputElement>) => {
			setLocalName(e.target.value);
			persistName(e.target.value);
		},
		[persistName],
	);

	const handleLanguageChange = async (
		e: React.FormEvent<HTMLSelectElement>,
	) => {
		const lang = e.currentTarget.value;

		try {
			const patch = { language: lang };

			await invoke("update_user_cmd", { id: user?.id, patch });
			emit("ui:update_user", patch);
			emit("ui:change_language", lang);
		} catch (_e) {
			toast.error(t("errors:error_changing_language"));
		}
	};

	useEffect(() => {
		return () => {
			persistName.flush();
		};
	}, [persistName]);

	return (
		<div className="flex h-full w-full justify-center">
			<Section>
				<SectionTitle>{t("peers:device_section")}</SectionTitle>
				<div className="space-y-8">
					<Setting>
						<SettingTitle>{t("peers:display_name")}</SettingTitle>
						<SettingsAction>
							<Input
								className="h-6 w-64 border-none bg-transparent! text-right shadow-none"
								value={localName}
								onChange={handleDisplayNameChange}
								maxLength={64}
							/>
						</SettingsAction>
					</Setting>
				</div>
				<SectionDivider />
				<SectionTitle>{t("common:language_section")}</SectionTitle>
				<Setting>
					<SettingTitle>{t("common:app_language")}</SettingTitle>
					<SettingsAction>
						<NativeSelect
							defaultValue={user?.language ?? "en"}
							onChange={handleLanguageChange}
							className="rounded-full border-none shadow-sm"
						>
							{SUPPORTED_LANGUAGES.map((lang) => (
								<NativeSelectOption
									key={`settings-ns-${lang.code}`}
									value={lang.code}
								>
									{lang.label}
								</NativeSelectOption>
							))}
						</NativeSelect>
					</SettingsAction>
				</Setting>
			</Section>
		</div>
	);
};
