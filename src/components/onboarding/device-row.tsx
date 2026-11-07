import { useTranslation } from "react-i18next";
import { DicebearAvatar } from "@/components/dicebear-avatar";
import { getPlatformMeta } from "@/components/main/contact-columns";
import { PlatformIcon } from "@/components/platform-icon";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { Platform } from "@/type";

export interface DeviceRowProps {
	endpointId: string;
	name?: string;
	platform?: Platform | null;
	online?: boolean;
	actionLabel?: string;
	actionDisabled?: boolean;
	onAction?: () => void;
	className?: string;
}

export const DeviceRow = ({
	endpointId,
	name,
	platform,
	online,
	actionLabel,
	actionDisabled,
	onAction,
	className,
}: DeviceRowProps) => {
	const { t } = useTranslation();

	const meta = getPlatformMeta(platform);
	const hasPresence = online !== undefined;
	const peerName =
		name || t("peers:peer_default_name", { id: endpointId.slice(-4) });

	return (
		<div
			className={cn(
				"flex h-14 shrink-0 flex-row items-center gap-x-3 px-3",
				className,
			)}
		>
			<div className="relative shrink-0">
				<DicebearAvatar
					seed={endpointId}
					className={cn("h-8 w-8", hasPresence && !online && "opacity-60")}
				/>
				{hasPresence && (
					<span
						className={cn(
							"absolute -right-0.5 -bottom-0.5 h-3 w-3 rounded-full border-2 border-background-surface",
							online ? "bg-green-500" : "bg-zinc-600",
						)}
					>
						<span className="sr-only">
							{t(online ? "peers:device_online" : "peers:device_offline")}
						</span>
					</span>
				)}
			</div>
			<div className="flex min-w-0 flex-1 flex-col">
				<span className="truncate text-sm">{peerName}</span>
				{actionLabel && (
					<span className="flex flex-row items-center gap-x-1.5 text-muted text-xs">
						<PlatformIcon name={meta.icon} className="h-3 w-3" />
						{meta.label}
					</span>
				)}
			</div>
			{actionLabel && (
				<Button
					variant="outline"
					size="sm"
					className="shrink-0 rounded-full active:scale-[0.97]"
					disabled={actionDisabled}
					onClick={onAction}
				>
					{actionLabel}
				</Button>
			)}
			{!actionLabel && (
				<div className="flex shrink-0 flex-row items-center gap-x-2 text-muted">
					<PlatformIcon name={meta.icon} className="h-4 w-4" />
					<span className="text-sm">{meta.label}</span>
				</div>
			)}
		</div>
	);
};
