import {
	AnimatePresence,
	type HTMLMotionProps,
	motion,
	type Transition,
	useMotionTemplate,
	useSpring,
} from "motion/react";
import type { HTMLAttributes, ReactNode, Ref } from "react";
import useMeasure from "react-use-measure";
import { cn } from "@/lib/utils";
import { HeroIcon, type HeroIconName } from "../hero-icon";
import { Button, type ButtonProps } from "../ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "../ui/tooltip";

type OneOrTwoChildren = ReactNode | [ReactNode, ReactNode];

type NavbarProps = {
	children: OneOrTwoChildren;
} & HTMLAttributes<HTMLDivElement>;

type NavbarSectionProps = {
	children: ReactNode | ReactNode[];
	align: "start" | "end";
};

type NavbarGroupProps = {
	children: ReactNode | ReactNode[];
	glare?: boolean;
	layoutId?: string;
} & HTMLMotionProps<"div">;

type NavbarActionProps = {
	layoutId: string;
	iconName?: HeroIconName;
	tooltip?: string;
	iconClassName?: string;
	ref?: Ref<HTMLDivElement>;
} & Omit<ButtonProps, "ref">;

type NavbarNavigationProps = {
	canGoBack?: boolean;
	canGoForward?: boolean;
	navBack: () => void;
	navForward: () => void;
};

const baseTransition: Transition = {
	duration: 0.3,
	ease: [0.25, 1, 0.5, 1],
	type: "spring",
	bounce: 0,
};

const SPRING = {
	mass: 0.1,
};

export const Navbar = ({ children, className }: NavbarProps) => (
	<div
		className={cn(
			"nav-bg fixed top-2 right-2 z-20 flex h-14 w-[calc(100vw-232px)] flex-row items-center justify-between rounded-lg px-2",
			className,
		)}
	>
		<div className="absolute h-full w-full" data-tauri-drag-region />
		{children}
	</div>
);

export const NavbarSection = ({ children, align }: NavbarSectionProps) => (
	<div
		className={cn(
			"flex w-1/2 flex-row items-center justify-start gap-x-2",
			align === "end" && "justify-end",
		)}
	>
		<AnimatePresence initial={false} mode="popLayout">
			{children}
		</AnimatePresence>
	</div>
);

export const NavbarGroup = ({
	children,
	glare,
	layoutId,
	className,
	...divProps
}: NavbarGroupProps) => {
	const [elementRef, bounds] = useMeasure();

	const x = useSpring(0, SPRING);
	const y = useSpring(0, SPRING);
	const opacity = useSpring(0, SPRING);

	const background = useMotionTemplate`
			radial-gradient(
				160px circle at ${x}px ${y}px,
				rgba(255, 255, 255, 0.4),
				transparent 40%
			)
		`;

	const pointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
		if (!glare) return;
		const rect = e.currentTarget.getBoundingClientRect();
		x.set(e.clientX - rect.left);
		y.set(e.clientY - rect.top);
	};

	const pointerEnter = () => {
		if (!glare) return;
		opacity.set(0.35);
	};

	const pointerLeave = () => {
		if (!glare) return;
		opacity.set(0);
	};

	return (
		<motion.div
			layoutId={layoutId}
			initial={{ x: -16, opacity: 0, filter: "blur(4px)" }}
			animate={{
				width: bounds.width > 0 ? bounds.width : undefined,
				x: 0,
				opacity: 1,
				filter: "blur(0px)",
			}}
			exit={{ x: -16, opacity: 0, filter: "blur(4px)" }}
			className={cn(
				// `relative` anchors the glare overlay and the absolutely positioned
				// children that AnimatePresence's popLayout mode pops out on exit.
				"relative flex flex-row items-center",
				"edge-highlight h-10 gap-x-0.5 overflow-hidden rounded-3xl bg-background-popup/80 shadow-lg backdrop-blur-xl dark:bg-background-popup/70",
				className,
			)}
			onPointerMove={pointerMove}
			onPointerEnter={pointerEnter}
			onPointerLeave={pointerLeave}
			transition={baseTransition}
			{...divProps}
		>
			{glare && (
				<motion.div
					aria-hidden
					className="pointer-events-none absolute inset-0"
					style={{
						background,
						opacity,
					}}
				/>
			)}
			<div ref={elementRef} className="inline-flex items-center px-1">
				<AnimatePresence mode="popLayout">{children}</AnimatePresence>
			</div>
		</motion.div>
	);
};

/**
 * Callers must give each action a unique `key` (typically its `layoutId`):
 * the parent AnimatePresence identifies children by key, and without one it
 * can't detect removals, so exit animations never run.
 *
 * `ref` is forwarded to the motion wrapper rather than the Button so that
 * popLayout pops the whole wrapper out of the flow while it exits.
 */
export const NavbarAction = ({
	ref,
	iconName,
	tooltip,
	layoutId: _layoutId,
	iconClassName,
	...props
}: NavbarActionProps) => {
	const content = (
		<motion.div
			ref={ref}
			initial={{ opacity: 0, filter: "blur(4px)" }}
			animate={{ opacity: 1, filter: "blur(0px)" }}
			exit={{ opacity: 0, filter: "blur(4px)" }}
			transition={baseTransition}
		>
			<Button
				variant="ghost"
				className="h-8 w-8 rounded-2xl hover:bg-border/80 active:scale-[0.97] dark:hover:bg-white/5"
				{...props}
			>
				<HeroIcon name={iconName || "chevron-left"} className={iconClassName} />
			</Button>
		</motion.div>
	);

	return tooltip ? (
		<Tooltip>
			<TooltipTrigger asChild>{content}</TooltipTrigger>
			<TooltipContent>
				<p>{tooltip}</p>
			</TooltipContent>
		</Tooltip>
	) : (
		content
	);
};

/**
 * Vertical separator between actions in a NavbarGroup. A motion element so it
 * can blur out alongside the actions; like NavbarAction, it needs a `key`.
 */
export const NavbarDivider = ({ ref }: { ref?: Ref<HTMLDivElement> }) => (
	<motion.div
		ref={ref}
		aria-hidden
		className="h-5 w-px bg-border"
		initial={{ opacity: 0, filter: "blur(4px)" }}
		animate={{ opacity: 1, filter: "blur(0px)" }}
		exit={{ opacity: 0, filter: "blur(4px)" }}
		transition={baseTransition}
	/>
);

export const NavbarNavigation = ({
	navBack,
	navForward,
	canGoBack,
	canGoForward,
}: NavbarNavigationProps) => (
	<NavbarGroup layoutId="nav-group-navigation" glare>
		<NavbarAction
			key="nav-back"
			layoutId="nav-back"
			iconName="chevron-left"
			iconClassName="-ml-0.5"
			disabled={!canGoBack}
			onClick={navBack}
		/>
		<NavbarDivider key="nav-divider" />
		<NavbarAction
			key="nav-forward"
			layoutId="nav-forward"
			iconName="chevron-right"
			iconClassName="-mr-0.5"
			disabled={!canGoForward}
			onClick={navForward}
		/>
	</NavbarGroup>
);
