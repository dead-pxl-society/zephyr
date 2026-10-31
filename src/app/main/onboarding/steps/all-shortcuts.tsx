import { motion, type Variants } from "motion/react";
import { useCallback, useState } from "react";
import { useTranslation } from "react-i18next";
import { CheckCirclePixel } from "@/components/onboarding/check-circle-pixel";
import { ContinueButton } from "@/components/onboarding/continue-button";
import CRTWarp from "@/components/onboarding/crt-wrap";
import { ExpandingArrowRight } from "@/components/onboarding/expanding-arrow-right";
import { PaperPlanePixel } from "@/components/onboarding/paper-plane-pixel";
import { ReceiveMonitorPixel } from "@/components/onboarding/receive-monitor-pixel";
import { XCirclePixel } from "@/components/onboarding/x-circle-pixel";
import {
	Setting,
	SettingDescription,
	SettingsAction,
	SettingsGroup,
	SettingTitle,
} from "@/components/settings/setting";
import { ShortcutRecorder } from "@/components/settings/shortcut-recorder";
import { useShortcutConfig } from "@/lib/hooks/use-shortcut-config";
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

export const AllShortcutsStep = () => {
	const [ready, setReady] = useState(false);
	const onCanvasReady = useCallback(() => setReady(true), []);

	const { next } = useOnboarding();

	const { shortcuts, updateShortcut } = useShortcutConfig();

	const { t } = useTranslation();

	return (
		<div className="relative grid h-full w-full grid-cols-[1fr_1.4fr] gap-4 p-4 py-10">
			<motion.div
				variants={rootVariants}
				initial="initial"
				animate="animate"
				exit="exit"
				className="overflow-hidden rounded-2xl border border-border bg-background-surface"
			>
				<motion.div
					className="relative h-full min-h-0 overflow-hidden rounded-2xl border border-border bg-[#0A0A0A] dark:bg-transparent"
					variants={itemVariants}
				>
					<motion.div
						className="absolute size-full"
						initial={{ opacity: 0 }}
						animate={{ opacity: ready ? 1 : 0 }}
						transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
					>
						<CRTWarp
							color="#B0D2F6"
							backgroundColor="#0A0A0A"
							waveAmplitude={0.25}
							waveFrequency={2.25}
							rgbShift={0.03}
							speed={0.1}
							onReady={onCanvasReady}
						/>
					</motion.div>
				</motion.div>
			</motion.div>
			<motion.div
				variants={rootVariants}
				initial="initial"
				animate="animate"
				exit="exit"
				className="flex min-h-0 flex-col items-start justify-center gap-4"
			>
				<div className="flex flex-col items-center gap-1">
					<motion.p
						variants={itemVariants}
						className="text-center font-medium text-2xl"
					>
						{t("onboarding:all_shortcuts_title")}
					</motion.p>
					<motion.p
						variants={itemVariants}
						className="w-[80%] text-center text-muted"
					>
						{t("onboarding:all_shortcuts_description")}
					</motion.p>
				</div>
				<SettingsGroup>
					<motion.div
						variants={itemVariants}
						className="flex items-center gap-4"
					>
						<div className="shrink-0">
							<PaperPlanePixel
								className="size-6 text-foreground"
								style={{ filter: "var(--phosphor)" }}
							/>
						</div>
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
					</motion.div>
					<motion.div
						variants={itemVariants}
						className="flex items-center gap-4"
					>
						<div className="shrink-0">
							<ReceiveMonitorPixel
								className="size-6 text-foreground"
								style={{ filter: "var(--phosphor)" }}
							/>
						</div>
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
					</motion.div>
					<motion.div
						variants={itemVariants}
						className="flex items-center gap-4"
					>
						<div className="shrink-0">
							<CheckCirclePixel
								className="size-6 text-foreground"
								style={{ filter: "var(--phosphor)" }}
							/>
						</div>
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
					</motion.div>
					<motion.div
						variants={itemVariants}
						className="flex items-center gap-4"
					>
						<div className="shrink-0">
							<XCirclePixel
								className="size-6 text-foreground"
								style={{ filter: "var(--phosphor)" }}
							/>
						</div>
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
					</motion.div>
				</SettingsGroup>
				<motion.div variants={itemVariants} className="self-center">
					<ContinueButton onClick={next}>
						{t("common:next")} <ExpandingArrowRight />
					</ContinueButton>
				</motion.div>
			</motion.div>
		</div>
	);
};
