import type { HTMLAttributes, PropsWithChildren, ReactNode } from "react";
import { cn } from "@/lib/utils";
import type { User } from "@/type";
import { HeroIcon, type HeroIconProps } from "../hero-icon";
import { LucideIcon, type LucideIconProps } from "../lucide-icon";
import { Button, type ButtonProps } from "../ui/button";
import { Requests } from "./requests";
import { UserFooter } from "./user-footer";

type SidebarProps = {
	user: User | null;
};

type SidebarItemProps = {
	icon?: HeroIconProps;
	lucideIcon?: LucideIconProps;
	customIcon?: ReactNode;
	active?: boolean;
} & ButtonProps;

type SidebarTitleProps = {
	icon?: HeroIconProps;
} & HTMLAttributes<HTMLDivElement>;

export const Sidebar = ({
	user,
	children,
}: PropsWithChildren<SidebarProps>) => (
	<div className="relative h-full w-[224px]">
		<div
			data-tauri-drag-region
			className="absolute top-0 right-0 left-0 h-12"
		/>
		<ul className="h-[calc(100%-64px)] w-full px-2 macos:pt-12">{children}</ul>
		<Requests />
		{user && <UserFooter user={user} />}
	</div>
);

export const SidebarTitle = ({
	children,
	className,
	icon,
	...divProps
}: PropsWithChildren<SidebarTitleProps>) => (
	<div
		className={cn(
			"mb-2 flex flex-row items-center justify-start gap-x-1",
			className,
		)}
		{...divProps}
	>
		{icon && (
			<HeroIcon
				iconStyle="mini"
				{...icon}
				className={cn("h-3 w-3 text-muted", icon.className)}
			/>
		)}
		<p className="font-medium text-muted text-xs">{children}</p>
	</div>
);

export const SidebarItem = ({
	children,
	className,
	icon,
	lucideIcon,
	customIcon,
	active,
	...buttonProps
}: SidebarItemProps) => (
	<Button
		variant="ghost"
		className={cn(
			"w-full justify-start px-2 font-normal transition-none hover:bg-background-popup/80 dark:hover:bg-neutral-700/40 macos:dark:hover:bg-background-popup/70",
			active &&
				"bg-background-popup/80 macos:bg-background-popup/80 hover:bg-background-popup/80 macos:hover:bg-background-popup/80 dark:bg-neutral-700/60 macos:dark:bg-background-popup/90 hover:dark:bg-neutral-700/60 macos:hover:dark:bg-background-popup/90",
			className,
		)}
		{...buttonProps}
	>
		{customIcon}
		{icon && !customIcon && (
			<HeroIcon
				iconStyle="solid"
				{...icon}
				className={cn("h-6 w-6", icon.className)}
			/>
		)}
		{lucideIcon && !customIcon && !icon && (
			<LucideIcon
				{...lucideIcon}
				className={cn("h-6 w-6", lucideIcon.className)}
			/>
		)}
		{children}
	</Button>
);
