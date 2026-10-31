import type { HTMLAttributes, PropsWithChildren } from "react";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import type { User } from "@/type";
import { DicebearAvatar } from "../dicebear-avatar";
import { HeroIcon, type HeroIconProps } from "../hero-icon";
import { LucideIcon, type LucideIconProps } from "../lucide-icon";
import { Button, type ButtonProps } from "../ui/button";

type SidebarItemProps = {
	icon?: HeroIconProps;
	lucideIcon?: LucideIconProps;
	active?: boolean;
} & ButtonProps;

type SidebarUserItemProps = {
	user: User | null;
} & HTMLAttributes<HTMLButtonElement>;

export const Sidebar = ({ children }: PropsWithChildren) => (
	<div className="relative h-full w-[216px] border-r-[1px] border-r-stone-200 dark:border-r-border">
		<div
			data-tauri-drag-region
			className="absolute top-0 right-0 left-0 h-10"
		/>
		<ul className="h-[calc(100%-64px)] w-full px-2 pt-10">{children}</ul>
	</div>
);

export const SidebarUserItem = ({
	user,
	...buttonProps
}: SidebarUserItemProps) => {
	const { t } = useTranslation("peers");

	return (
		<button
			type="button"
			className="flex w-full flex-row items-center gap-x-1 rounded-lg px-1 py-2 text-start hover:bg-background-top/80 dark:hover:bg-background-top"
			{...buttonProps}
		>
			<DicebearAvatar
				seed={user?.endpointId}
				containerClassName="min-w-10"
				className="h-10 w-10"
			/>
			<div>
				<p className="line-clamp-1 text-sm">{user?.name}</p>
				<p className="text-muted text-xs">{t("edit_device")}</p>
			</div>
		</button>
	);
};

export const SidebarItem = ({
	children,
	className,
	icon,
	lucideIcon,
	active,
	...buttonProps
}: SidebarItemProps) => (
	<Button
		variant="ghost"
		className={cn(
			"w-full justify-start px-2! font-normal transition-none hover:bg-background-top",
			active && "bg-background-popup hover:bg-background-popup",
			className,
		)}
		{...buttonProps}
	>
		{icon && (
			<HeroIcon
				iconStyle="solid"
				{...icon}
				className={cn("h-6 w-6", icon.className)}
			/>
		)}
		{lucideIcon && !icon && (
			<LucideIcon
				{...lucideIcon}
				className={cn("h-6 w-6", lucideIcon.className)}
			/>
		)}
		{children}
	</Button>
);

export const SidebarDivider = () => (
	<div className="my-2 h-px w-full bg-stone-200 dark:bg-border" />
);
