import type { HTMLAttributes } from "react";
import { cn } from "@/lib/utils";

export const Section = ({
	children,
	className,
	...props
}: HTMLAttributes<HTMLDivElement>) => (
	<div className={cn("w-xl", className)} {...props}>
		{children}
	</div>
);

export const SectionTitle = ({
	children,
	className,
	...props
}: HTMLAttributes<HTMLParagraphElement>) => (
	<p className={cn("mb-4! text-2xl", className)} {...props}>
		{children}
	</p>
);

export const SectionDivider = ({
	className,
	...props
}: HTMLAttributes<HTMLDivElement>) => (
	<div
		className={cn("my-4 h-px w-full bg-stone-200 dark:bg-border", className)}
		{...props}
	/>
);
