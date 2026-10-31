import { Children, type HTMLAttributes, isValidElement } from "react";
import { cn } from "@/lib/utils";

const Setting = ({
	children,
	className,
	asButton,
	...props
}: HTMLAttributes<HTMLElement> & { asButton?: boolean }) => {
	const Comp = asButton ? "button" : "div";
	const childArray = Children.toArray(children);

	const title = childArray.filter(
		(child) => isValidElement(child) && child.type === SettingTitle,
	);
	const description = childArray.filter(
		(child) => isValidElement(child) && child.type === SettingDescription,
	);
	const action = childArray.filter(
		(child) => isValidElement(child) && child.type === SettingsAction,
	);

	return (
		<Comp
			type={asButton ? "button" : undefined}
			className={cn(
				"flex w-full flex-row items-center justify-between",
				asButton &&
					"-ml-2 cursor-pointer rounded-xl p-2 text-left hover:bg-background",
				className,
			)}
			{...props}
		>
			<div className="max-w-3/4 flex-1">
				{title}
				{description}
			</div>
			<div className="shrink-0">{action}</div>
		</Comp>
	);
};

const SettingTitle = ({
	children,
	className,
	...props
}: HTMLAttributes<HTMLParagraphElement>) => (
	<p className={cn("line-clamp-1 font-medium", className)} {...props}>
		{children}
	</p>
);

const SettingDescription = ({
	children,
	className,
	...props
}: HTMLAttributes<HTMLParagraphElement>) => (
	<p className={cn("line-clamp-3 text-muted text-sm", className)} {...props}>
		{children}
	</p>
);

const SettingsAction = ({
	children,
	className,
	...props
}: HTMLAttributes<HTMLDivElement>) => (
	<div className={cn("", className)} {...props}>
		{children}
	</div>
);

export const SettingsGroup = ({
	children,
	className,
	...props
}: HTMLAttributes<HTMLDivElement>) => (
	<div className={cn("space-y-4", className)} {...props}>
		{children}
	</div>
);

export { Setting, SettingTitle, SettingDescription, SettingsAction };
