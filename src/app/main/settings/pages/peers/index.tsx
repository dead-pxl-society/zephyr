import { invoke } from "@tauri-apps/api/core";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { useDebouncedCallback } from "use-debounce";
import { HeroIcon } from "@/components/hero-icon";
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
	SettingTitle,
} from "@/components/settings/setting";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { errorCode, toastError } from "@/lib/errors";
import { useConfig } from "@/lib/store/config";
import { useFamily } from "@/lib/store/family";
import { cn } from "@/lib/utils";

const BYTES_PER_MB = 1024 * 1024;
const CLIPBOARD_MAX_WARN_MB = 100;

type ClipboardPatch = {
	sync?: boolean;
	files?: boolean;
	maxBytes?: number;
};

export const PeersSettingsPage = () => {
	const config = useConfig();
	const family = useFamily();

	const clipboardSync = config.clipboardSync;
	const clipboardMaxMb = Math.round(config.clipboardMaxBytes / BYTES_PER_MB);
	const [localMaxMb, setLocalMaxMb] = useState(String(clipboardMaxMb));

	const warnOnSize = Number(localMaxMb) > CLIPBOARD_MAX_WARN_MB;

	const { t } = useTranslation();
	const navigate = useNavigate();

	const saveClipboard = async (patch: ClipboardPatch) => {
		try {
			await invoke("set_clipboard_settings_cmd", patch);
		} catch (_e) {
			toast.error(t("errors:error_updating_clipboard_settings"));
		}
	};

	const leaveFamily = async (force: boolean) => {
		try {
			await invoke("leave_family", { force });
			toast.success(t("peers:left_devices"));
		} catch (e) {
			if (errorCode(e) === "no_member_reachable" && !force) {
				toast.error(t("errors:no_member_reachable"), {
					action: {
						label: t("peers:leave_anyway"),
						onClick: () => leaveFamily(true),
					},
				});
				return;
			}
			toastError(e, "errors:error_leaving_devices");
		}
	};

	const persistMaxBytes = useDebouncedCallback(async (mb: number) => {
		await saveClipboard({ maxBytes: mb * BYTES_PER_MB });
	}, 500);

	const handleMaxSizeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
		setLocalMaxMb(e.target.value);

		const mb = Number(e.target.value);
		if (Number.isFinite(mb) && mb > 0) persistMaxBytes(mb);
	};

	useEffect(() => {
		return () => {
			persistMaxBytes.flush();
		};
	}, [persistMaxBytes]);

	useEffect(() => {
		setLocalMaxMb(String(clipboardMaxMb));
	}, [clipboardMaxMb]);

	return (
		<div className="flex h-full w-full justify-center">
			<Section>
				<SectionTitle>{t("navigation:devices")}</SectionTitle>
				<Setting asButton onClick={() => navigate("/settings/peers/blocked")}>
					<SettingTitle>{t("peers:blocked_devices")}</SettingTitle>
					<SettingDescription>
						{t("peers:blocked_devices_description")}
					</SettingDescription>
					<SettingsAction>
						<HeroIcon name="chevron-right" className="h-4 w-4 text-muted" />
					</SettingsAction>
				</Setting>
				<SectionDivider />
				<SectionTitle className="mb-0!">
					{t("peers:personal_devices")}
				</SectionTitle>
				<p className="mb-4! text-muted">
					{t("peers:personal_devices_description")}
				</p>
				<SectionTitle className="text-xl">
					{t("settings:clipboard_section")}
				</SectionTitle>
				<div className="space-y-8">
					<Setting>
						<SettingTitle>{t("settings:clipboard_sync")}</SettingTitle>
						<SettingDescription>
							{t("settings:clipboard_sync_description")}
						</SettingDescription>
						<SettingsAction>
							<Switch
								checked={clipboardSync}
								onCheckedChange={(sync) => saveClipboard({ sync })}
							/>
						</SettingsAction>
					</Setting>
					<Setting className={clipboardSync ? "" : "opacity-50"}>
						<SettingTitle>{t("settings:clipboard_files")}</SettingTitle>
						<SettingDescription>
							{t("settings:clipboard_files_description")}
						</SettingDescription>
						<SettingsAction>
							<Switch
								checked={config.clipboardFiles}
								disabled={!clipboardSync}
								onCheckedChange={(files) => saveClipboard({ files })}
							/>
						</SettingsAction>
					</Setting>
					<Setting className={clipboardSync ? "" : "opacity-50"}>
						<SettingTitle>{t("settings:clipboard_max_size")}</SettingTitle>
						<SettingDescription>
							<AnimatePresence initial={false} mode="popLayout">
								<motion.span
									key={warnOnSize ? "cp-file-desc-warn" : "cp-file-desc"}
									className={cn(
										"text-muted",
										warnOnSize && "text-amber-400/40",
									)}
									initial={{ opacity: 0 }}
									animate={{ opacity: 1 }}
									exit={{ opacity: 0 }}
									transition={{ ease: "easeOut", duration: 0.16 }}
								>
									{warnOnSize
										? t("settings:clipboard_max_size_warning")
										: t("settings:clipboard_max_size_description")}
								</motion.span>
							</AnimatePresence>
						</SettingDescription>
						<SettingsAction className="flex items-center gap-1">
							<Input
								type="number"
								min={1}
								className="h-6 w-20 border-none bg-transparent! text-right shadow-none"
								value={localMaxMb}
								disabled={!clipboardSync}
								onChange={handleMaxSizeChange}
							/>
							<span className="text-muted text-sm">MB</span>
						</SettingsAction>
					</Setting>
				</div>
				{family && (
					<>
						<SectionDivider />
						<Setting>
							<SettingTitle>{t("peers:leave_devices")}</SettingTitle>
							<SettingDescription>
								{t("peers:leave_devices_description", {
									count: family.memberCount,
								})}
							</SettingDescription>
							<SettingsAction>
								<DeleteConfirmButton
									layoutKey="leave-family"
									icon="arrow-left-start-on-rectangle"
									label={t("peers:leave")}
									confirmLabel={t("peers:leave")}
									onDelete={() => leaveFamily(false)}
								/>
							</SettingsAction>
						</Setting>
					</>
				)}
			</Section>
		</div>
	);
};
