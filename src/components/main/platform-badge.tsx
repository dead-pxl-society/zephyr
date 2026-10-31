import { useMemo } from "react";
import { cn } from "@/lib/utils";
import type { Platform } from "@/type";
import { PlatformIcon, type PlatformIconName } from "../platform-icon";

export type PlatformBadgeProps = {
	platform: Platform;
};
export const PlatformBadge = ({ platform }: PlatformBadgeProps) => {
	const [platformText, icon, platformClass] = useMemo(() => {
		switch (platform) {
			case "windows":
				return [
					"Windows",
					"windows",
					"bg-linear-to-b/oklch from-[#FFFFFF] to-[#ECFBFF] text-[#000205]/70 dark:from-[#000205] dark:to-[#000B17] dark:text-[#ECFBFF]/60",
				];
			case "macos":
				return [
					"macOS",
					"apple",
					"bg-linear-to-b/oklch from-[#FFFFFF] to-[#F7F8F9] text-[#020202]/70 dark:from-[#020202] dark:to-[#090A0B] dark:text-[#F7F8F9]/60",
				];
			case "android":
				return [
					"Android",
					"android",
					"bg-linear-to-b/oklch from-[#FFFFFF] to-[#EDFEF1] text-[#000301]/70 dark:from-[#000301] dark:to-[#000F03] dark:text-[#EDFEF1]/60",
				];
			case "ios":
				return [
					"iOS",
					"apple",
					"bg-linear-to-b/oklch from-[#FFFFFF] to-[#F7F8F9] text-[#020202]/70 dark:from-[#020202] dark:to-[#090A0B] dark:text-[#F7F8F9]/60",
				];
			case "linux":
				return [
					"Linux",
					"linux",
					"bg-linear-to-b/oklch from-[#FFFFFF] to-[#FFF8E8] text-[#030100]/70 dark:from-[#030100] dark:to-[#110800] dark:text-[#FFF8E8]/60",
				];
			default:
				return "";
		}
	}, [platform]);

	return (
		<div
			className={cn(
				"flex h-6 flex-row items-center justify-center gap-x-1 rounded-md px-2",
				platformClass,
			)}
		>
			<PlatformIcon name={icon as PlatformIconName} className="h-4 w-4" />
			<p className="text-xs font-mono">{platformText}</p>
		</div>
	);
};
