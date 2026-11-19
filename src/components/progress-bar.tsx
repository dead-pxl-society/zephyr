import {
	type MotionValue,
	motion,
	useMotionTemplate,
	useTransform,
} from "motion/react";
import type { HTMLAttributes } from "react";
import { cn } from "@/lib/utils";

/**
 * Backend progress events arrive roughly every 100ms. A physics spring keeps
 * its velocity when retargeted, so the bar glides between updates instead of
 * restarting a short tween on each one. Critically damped to avoid overshoot.
 */
export const PROGRESS_SPRING = { stiffness: 100, damping: 20, mass: 1 };

export type ProgressBarProps = {
	progress: MotionValue<number>;
	innerClassName?: string;
	showPercentage?: boolean;
} & HTMLAttributes<HTMLDivElement>;

export const ProgressBar = ({
	progress,
	className,
	innerClassName,
	showPercentage,
	...props
}: ProgressBarProps) => {
	const progressText = useTransform(
		progress,
		(v) => `${Math.min(Math.floor(v * 100), 100)}%`,
	);
	const clipProgress = useTransform(progress, (v) => 100 - v * 100);
	const clipPath = useMotionTemplate`inset(0 ${clipProgress}% 0 0)`;

	return (
		<div className="flex w-full flex-row items-center justify-center gap-x-1">
			<div
				{...props}
				className={cn(
					"h-1 w-full overflow-hidden rounded bg-gray-200 dark:bg-zinc-700",
					className,
				)}
			>
				<motion.div
					className={cn("h-full bg-blue-500", innerClassName)}
					style={{ clipPath }}
				/>
			</div>
			{showPercentage && (
				<motion.p className="w-9 text-center text-xs tabular-nums opacity-80">
					{progressText}
				</motion.p>
			)}
		</div>
	);
};
