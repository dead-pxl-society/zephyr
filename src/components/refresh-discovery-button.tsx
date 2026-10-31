import { useTranslation } from "react-i18next";
import { useRefreshDiscovery } from "@/lib/hooks/use-refresh-discovery";
import { cn } from "@/lib/utils";
import { HeroIcon } from "./hero-icon";
import { Button } from "./ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "./ui/tooltip";

interface RefreshDiscoveryButtonProps {
	className?: string;
	/** Show the label next to the icon instead of only in a tooltip. */
	showLabel?: boolean;
	/** Tooltips need a provider, which only the main window mounts. */
	tooltip?: boolean;
}

export const RefreshDiscoveryButton = ({
	className,
	showLabel = false,
	tooltip = true,
}: RefreshDiscoveryButtonProps) => {
	const { t } = useTranslation("peers");
	const { refresh, refreshing } = useRefreshDiscovery();
	const label = t("refresh_devices");

	const button = (
		<Button
			variant="ghost"
			aria-label={label}
			title={tooltip ? undefined : label}
			disabled={refreshing}
			onClick={refresh}
			className={cn(
				"h-7 gap-x-1 rounded-full px-2 font-normal text-muted text-xs hover:text-foreground active:scale-[0.96] disabled:opacity-100",
				!showLabel && "w-7 px-0",
				className,
			)}
		>
			<HeroIcon
				name="arrow-path"
				iconStyle="mini"
				className={cn(
					"h-4 w-4",
					refreshing && "animate-spin [animation-duration:0.6s]",
				)}
			/>
			{showLabel && <span>{label}</span>}
		</Button>
	);

	if (!tooltip || showLabel) return button;

	return (
		<Tooltip>
			<TooltipTrigger asChild>{button}</TooltipTrigger>
			<TooltipContent>
				<p>{label}</p>
			</TooltipContent>
		</Tooltip>
	);
};
