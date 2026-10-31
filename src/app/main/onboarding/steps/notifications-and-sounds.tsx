import { invoke } from "@tauri-apps/api/core";
import { emit } from "@tauri-apps/api/event";
import {
	isPermissionGranted,
	requestPermission,
} from "@tauri-apps/plugin-notification";
import { motion, type Variants } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { HolographicModelCanvas } from "@/components/holographic-crt";
import { ContinueButton } from "@/components/onboarding/continue-button";
import { Topography } from "@/components/onboarding/topography";
import {
	Setting,
	SettingDescription,
	SettingsAction,
	SettingTitle,
} from "@/components/settings/setting";
import { Switch } from "@/components/ui/switch";
import { useUser } from "@/lib/store/user";
import { useOnboarding } from "../use-onboarding";

const rootVariants: Variants = {
	initial: {},
	animate: { transition: { delayChildren: 0.08, staggerChildren: 0.07 } },
	exit: {
		opacity: 0,
		scale: 0.95,
	},
};

const itemVariants: Variants = {
	initial: { opacity: 0, y: 8 },
	animate: { opacity: 1, y: 0 },
};

export const NotificationsAndSoundsStep = () => {
	const { next } = useOnboarding();
	const user = useUser();

	const [granted, setGranted] = useState(false);
	const asked = useRef(false);

	const { t } = useTranslation();

	const askForPermission = async () => {
		if (await isPermissionGranted()) {
			setGranted(true);
			return;
		}

		setGranted((await requestPermission()) === "granted");
	};

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

	useEffect(() => {
		if (asked.current) return;
		asked.current = true;

		askForPermission();
	}, []);

	return (
		<div className="relative grid h-full w-full grid-cols-[1.4fr_1fr] gap-4 p-4 py-10">
			<motion.div
				variants={rootVariants}
				initial="initial"
				animate="animate"
				exit="exit"
				className="flex min-h-0 flex-col items-start justify-center gap-4"
			>
				<div className="flex w-full flex-col items-center gap-1">
					<motion.p
						variants={itemVariants}
						className="text-center font-medium text-2xl"
					>
						{t("onboarding:notifications_and_sounds_title")}
					</motion.p>
					<motion.p
						variants={itemVariants}
						className="w-[80%] text-center text-muted"
					>
						{t("onboarding:notifications_and_sounds_description")}
					</motion.p>
				</div>
				<motion.div variants={itemVariants} className="w-md self-center">
					<div className={!granted ? "opacity-60!" : ""}>
						<Setting>
							<SettingTitle>
								{t("notifications:enable_notifications")}
							</SettingTitle>
							<SettingDescription>
								{t("notifications:enable_notifications_description")}
							</SettingDescription>
							<SettingsAction>
								<Switch
									disabled={!granted}
									checked={user?.notifications ?? false}
									onCheckedChange={handleToggle("notifications")}
								/>
							</SettingsAction>
						</Setting>
					</div>
				</motion.div>
				<motion.div variants={itemVariants} className="w-md self-center">
					<div className="mb-2 h-px w-full bg-border" />
					<Setting>
						<SettingTitle>{t("sounds:sound_effects")}</SettingTitle>
						<SettingDescription>
							{t("sounds:sound_effects_description")}
						</SettingDescription>
						<SettingsAction>
							<Switch
								checked={user?.sounds ?? false}
								onCheckedChange={handleToggle("sounds")}
							/>
						</SettingsAction>
					</Setting>
				</motion.div>
				<motion.div variants={itemVariants} className="self-center">
					<ContinueButton onClick={next}>
						{t("onboarding:action_start_using")} 🎉
					</ContinueButton>
				</motion.div>
			</motion.div>
			<motion.div
				variants={rootVariants}
				initial="initial"
				animate="animate"
				exit="exit"
			>
				<motion.div
					variants={itemVariants}
					className="relative h-full min-h-0 overflow-hidden rounded-2xl border border-border bg-[#0A0A0A] dark:bg-transparent"
				>
					<div className="absolute size-full">
						<Topography
							lowColor="#3E97E6" // "#7a5c12"
							midColor="#8DBFF1" // "#eed263"
							highColor="#D0E6FD" // "#fff4d0"
							morphAmount={2}
							speed={0.25}
							morphSpeed={0.07}
							bands={2}
							thickness={0.08}
							glow={0.6}
							grainIntensity={0.04}
							scale={2.5}
							pixelSize={1.25}
						/>
					</div>
					<div className="absolute size-full">
						<HolographicModelCanvas
							geometry="bell"
							spin={true}
							scale={3.5}
							spinSpeed={0.225}
							baseColor={[0.553, 0.749, 0.945]}
						/>
					</div>
				</motion.div>
			</motion.div>
		</div>
	);
};
