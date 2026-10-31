import { AnimatePresence, motion } from "motion/react";
import {
	type ForwardedRef,
	forwardRef,
	type PropsWithChildren,
	useCallback,
	useEffect,
	useImperativeHandle,
	useMemo,
	useRef,
	useState,
} from "react";
import useMeasure from "react-use-measure";
import { Drawer } from "vaul";
import { cn } from "@/lib/utils";
import { HeroIcon } from "../hero-icon";

const EXIT_DURATION_MS = 500;

export interface DynamicDrawerHandles {
	present: () => void;
	dismiss: () => void;
}

type DynamicDrawerProps = {
	viewKey: string;
	hideClose?: boolean;
	preventClose?: boolean;
	fullscreen?: boolean;
	onOpenChange?: (open: boolean) => void;
	onClosed?: () => void;
};

export const DynamicDrawer = forwardRef(
	(
		{
			children,
			viewKey,
			preventClose,
			fullscreen,
			hideClose,
			onOpenChange,
			onClosed,
		}: PropsWithChildren<DynamicDrawerProps>,
		ref: ForwardedRef<DynamicDrawerHandles>,
	) => {
		const [open, setOpen] = useState(false);
		const [elementRef, bounds] = useMeasure();
		const previousHeightRef = useRef(0);
		const wasOpenRef = useRef(false);
		const onClosedRef = useRef(onClosed);
		onClosedRef.current = onClosed;

		const present = useCallback(() => setOpen(true), []);
		const dismiss = useCallback(() => setOpen(false), []);

		const handleOpenChange = (newOpen: boolean) => {
			if (!newOpen && preventClose) return;
			if (onOpenChange) onOpenChange(newOpen);
			setOpen(newOpen);
		};

		const opacityDuration = useMemo(() => {
			const currentHeight = bounds.height;
			const previousHeight = previousHeightRef.current;

			const MIN_DURATION = 0.15;
			const MAX_DURATION = 0.27;

			if (!previousHeightRef.current) {
				previousHeightRef.current = currentHeight;
				return MIN_DURATION;
			}

			const heightDifference = Math.abs(currentHeight - previousHeight);
			previousHeightRef.current = currentHeight;

			const duration = Math.min(
				Math.max(heightDifference / 500, MIN_DURATION),
				MAX_DURATION,
			);

			return duration;
		}, [bounds.height]);

		useImperativeHandle(ref, () => ({ present, dismiss }));

		useEffect(() => {
			if (open) {
				wasOpenRef.current = true;
				return;
			}

			if (!wasOpenRef.current) return;
			wasOpenRef.current = false;

			const timeout = setTimeout(
				() => onClosedRef.current?.(),
				EXIT_DURATION_MS,
			);

			return () => clearTimeout(timeout);
		}, [open]);

		return (
			<Drawer.Root open={open} onOpenChange={handleOpenChange}>
				<Drawer.Portal>
					<Drawer.Overlay
						className="fixed inset-0 z-10 bg-black/20"
						onClick={dismiss}
					/>
					<Drawer.Content
						asChild
						className={cn(
							"fixed right-4 bottom-4 z-10 mx-auto max-w-[361px] overflow-hidden rounded-[36px] bg-background-popup outline-none md:mx-auto md:w-full",
							fullscreen ? "left-4" : "left-[calc(1rem+224px)]",
							!open && "bottom-0",
						)}
					>
						<motion.div
							animate={{
								height: bounds.height,
								transition: {
									duration: 0.27,
									ease: [0.25, 1, 0.5, 1],
								},
							}}
						>
							{!hideClose && (
								<Drawer.Close asChild>
									<button
										type="button"
										data-vaul-no-drag=""
										className="absolute top-5 right-4 z-10 flex h-8 w-8 items-center justify-center rounded-full bg-background-top text-muted transition-transform hover:text-foreground focus:scale-95 focus-visible:shadow-focus-ring-button active:scale-90"
									>
										<HeroIcon name="close" className="h-5 w-5" />
									</button>
								</Drawer.Close>
							)}
							<div ref={elementRef} className="px-6 pt-2.5 pb-6 antialiased">
								<AnimatePresence
									initial={false}
									mode="popLayout"
									custom={viewKey}
								>
									<motion.div
										initial={{
											opacity: 0,
											transform: "scale(0.92)",
											filter: "blur(4px)",
										}}
										animate={{
											opacity: 1,
											transform: "scale(1)",
											filter: "blur(0px)",
										}}
										exit={{
											opacity: 0,
											transform: "scale(0.92)",
											filter: "blur(4px)",
										}}
										key={viewKey}
										transition={{
											duration: opacityDuration,
											ease: [0.26, 0.08, 0.25, 1],
										}}
									>
										{children}
									</motion.div>
								</AnimatePresence>
							</div>
						</motion.div>
					</Drawer.Content>
				</Drawer.Portal>
			</Drawer.Root>
		);
	},
);
