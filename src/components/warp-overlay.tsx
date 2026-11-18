import { AnimatePresence, motion, useAnimate } from "motion/react";
import { type PropsWithChildren, useEffect, useRef } from "react";
import { cn } from "@/lib/utils";

const PRIMARY_GLOW = "var(--accent)";

const ENTER_EASE = [0.59, 0, 0.35, 1] as const;
const SETTLE_EASE = [0.22, 1, 0.36, 1] as const;
const FLUSH_EASE = [0.55, 0, 0.75, 0.2] as const;

const CONTENT_BLUR = 12;
const CONTENT_TILT = 50;
const BREATHER_CENTER_GAP = 8;

type WarpContentProps = PropsWithChildren<{
	active: boolean;
	intensity?: number;
	className?: string;
}>;

/**
 * Wraps the content that sits behind a WarpOverlay. While `active` it blurs
 * the content and, on activation, briefly shrinks and skews it.
 */
export const WarpContent = ({
	active,
	intensity = 0.05,
	className,
	children,
}: WarpContentProps) => {
	const [scope, animate] = useAnimate<HTMLDivElement>();
	const blurred = useRef(false);

	useEffect(() => {
		const element = scope.current;
		if (!element || active === blurred.current) return;
		blurred.current = active;

		animate(
			element,
			{ filter: `blur(${active ? CONTENT_BLUR : 0}px)` },
			{ duration: 0.35, ease: ENTER_EASE },
		).then(() => {
			if (!blurred.current) element.style.filter = "none";
		});
	}, [active, animate, scope]);

	useEffect(() => {
		if (!active || !scope.current) return;

		animate(
			scope.current,
			{
				scaleY: [1, 1 - intensity * 0.8, 1],
				scaleX: [1, 1 - intensity * 0.6, 1],
				skewX: [0, -intensity * 20, 0],
			},
			{
				duration: 1.8,
				times: [0, 0.167, 1],
				ease: [ENTER_EASE, SETTLE_EASE],
			},
		);
	}, [active, intensity, animate, scope]);

	return (
		<motion.div ref={scope} className={className}>
			{children}
		</motion.div>
	);
};

const glow = (color: string, alpha: number) =>
	`radial-gradient(circle closest-side, color-mix(in oklch, ${color} ${alpha}%, transparent) 0%, transparent 100%)`;

type WarpOverlayProps = PropsWithChildren<{
	visible: boolean;
	className?: string;
}>;

export const WarpOverlay = ({
	visible,
	className,
	children,
}: WarpOverlayProps) => (
	<AnimatePresence>
		{visible && (
			<motion.div
				key="warp-overlay"
				className={cn(
					"pointer-events-none absolute inset-0 z-50 overflow-hidden [container-type:size]",
					className,
				)}
			>
				<motion.div
					className="-translate-1/2 absolute top-full left-1/2 aspect-square w-[max(33cqw,33cqh)] rounded-full"
					style={{ background: glow(PRIMARY_GLOW, 85) }}
					initial={{ scale: 0, opacity: 1 }}
					animate={{ scale: 7, opacity: 0.2 }}
					exit={{ scale: 0, opacity: 1 }}
					transition={{ duration: 0.35, ease: ENTER_EASE }}
				/>
				<Breather corner="top-left" color={PRIMARY_GLOW} />
				<Breather corner="bottom-right" color={PRIMARY_GLOW} />
				<motion.div
					className="absolute inset-0 bg-accent/16"
					initial={{ opacity: 0 }}
					animate={{ opacity: 1 }}
					exit={{ opacity: 0 }}
					transition={{ duration: 0.35 }}
				/>
				<motion.div
					className="absolute inset-0 flex items-center justify-center"
					style={{ originX: 0.5, originY: 1, transformPerspective: 800 }}
					initial={{ opacity: 0, y: "45%", rotateX: CONTENT_TILT, scale: 0.9 }}
					animate={{
						opacity: 1,
						y: 0,
						rotateX: 0,
						scale: 1,
						transition: {
							delay: 0.05,
							duration: 0.4,
							ease: SETTLE_EASE,
							opacity: { delay: 0.05, duration: 0.15 },
						},
					}}
					exit={{
						opacity: 0,
						y: "45%",
						rotateX: CONTENT_TILT,
						scale: 0.9,
						transition: {
							duration: 0.3,
							ease: FLUSH_EASE,
							opacity: { delay: 0.1, duration: 0.2 },
						},
					}}
				>
					{children}
				</motion.div>
			</motion.div>
		)}
	</AnimatePresence>
);

type BreatherProps = {
	corner: "top-left" | "bottom-right";
	color: string;
};

const Breather = ({ corner, color }: BreatherProps) => (
	<motion.div
		className={cn(
			"absolute aspect-square",
			corner === "top-left"
				? "-translate-1/2 top-0 left-0"
				: "translate-1/2 right-0 bottom-0",
		)}
		style={{
			width: `calc(hypot(100cqw, 100cqh) - ${BREATHER_CENTER_GAP * 2}px)`,
		}}
		initial={{ scale: 0, opacity: 0 }}
		animate={{
			scale: 1,
			opacity: 1,
			transition: { delay: 0.05, duration: 0.35, ease: ENTER_EASE },
		}}
		exit={{ scale: 0, opacity: 0, transition: { duration: 0.2 } }}
	>
		<motion.div
			className="h-full w-full rounded-full"
			style={{ background: glow(color, 56) }}
			animate={{ scale: [1, 0.85, 1] }}
			transition={{
				delay: 0.4,
				duration: 15,
				ease: "easeInOut",
				repeat: Infinity,
			}}
		/>
	</motion.div>
);
