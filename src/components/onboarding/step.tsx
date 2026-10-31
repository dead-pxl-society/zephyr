import type { HTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/utils";
import { HeroIcon, type HeroIconProps } from "../hero-icon";

export const Step = ({
	children,
	className,
	...props
}: HTMLAttributes<HTMLDivElement>) => (
	<div className={cn("w-xl", className)} {...props}>
		{children}
	</div>
);

export const StepHeader = ({
	icon,
	title,
	description,
	className,
}: {
	icon?: HeroIconProps;
	title: string;
	description?: ReactNode;
	className?: string;
}) => (
	<div className={cn("mb-8 space-y-2", className)}>
		{icon && (
			<div className="mb-4 flex size-10 items-center justify-center rounded-xl bg-background-top">
				<HeroIcon className="size-5" {...icon} />
			</div>
		)}
		<h1 className="font-semibold text-2xl tracking-tight">{title}</h1>
		{description && (
			<p className="text-balance text-muted leading-relaxed">{description}</p>
		)}
	</div>
);

export const StepBody = ({
	children,
	className,
	...props
}: HTMLAttributes<HTMLDivElement>) => (
	<div className={cn("space-y-4", className)} {...props}>
		{children}
	</div>
);

/** A dot per step; visited ones are clickable so the user can look back. */
export const StepProgress = ({
	count,
	index,
	furthestIndex,
	onSelect,
	className,
}: {
	count: number;
	index: number;
	furthestIndex: number;
	onSelect: (index: number) => void;
	className?: string;
}) => (
	<div className={cn("flex flex-row items-center gap-1.5", className)}>
		{Array.from({ length: count }, (_, i) => {
			const visited = i <= furthestIndex;

			return (
				<button
					// biome-ignore lint/suspicious/noArrayIndexKey: dots are positional
					key={i}
					type="button"
					aria-label={`${i + 1}`}
					aria-current={i === index}
					disabled={!visited}
					onClick={() => onSelect(i)}
					className={cn(
						"h-1.5 rounded-full transition-all duration-200",
						i === index ? "w-5 bg-foreground" : "w-1.5",
						i !== index &&
							visited &&
							"cursor-pointer bg-muted/60 hover:bg-muted",
						i !== index && !visited && "bg-muted/25",
					)}
				/>
			);
		})}
	</div>
);
