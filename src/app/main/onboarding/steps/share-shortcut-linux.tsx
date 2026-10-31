import {
	AnimatePresence,
	MotionConfig,
	motion,
	type PanInfo,
	useAnimate,
	useMotionTemplate,
	useMotionValue,
	useReducedMotion,
	type Variants,
} from "motion/react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { CursorHand } from "@/components/onboarding/cursor-hand";
import { CursorHandClick } from "@/components/onboarding/cursor-hand-click";
import { FileFolderPixel } from "@/components/onboarding/file-folder-pixel";
import { ShortcutKeycaps } from "@/components/shortcut-keycaps";
import { useUser } from "@/lib/store/user";
import { randomZephUrl } from "@/lib/zephs";
import { useOnboarding } from "../use-onboarding";

const EASE_OUT: [number, number, number, number] = [0.16, 1, 0.3, 1];
const EASE_DRAG: [number, number, number, number] = [0.45, 0, 0.2, 1];

const TRAVEL_X = 200;
const TRAVEL_Y = 10;
const HAND_X = 14;
const HAND_Y = 22;
const HAND_IN_X = 120;
const HAND_IN_Y = 96;

const HOLD = 1.2;
const USER_HOLD = 1600;
const MISS_HOLD = 450;

const rootVariants: Variants = {
	initial: {},
	animate: { transition: { delayChildren: 0.08, staggerChildren: 0.07 } },
	exit: {
		opacity: 0,
		scale: 0.95,
	},
};

const itemVariants: Variants = {
	initial: { opacity: 0, y: 8 },
	animate: { opacity: 1, y: 0 },
};

export const ShareShortcutLinuxStep = () => {
	const [scope, animate] = useAnimate();
	const scene = useRef<HTMLDivElement>(null);
	const zone = useRef<HTMLDivElement>(null);

	const reveal = useMotionValue(0);
	const clipPath = useMotionTemplate`circle(${reveal}% at 50% 50%)`;
	const fileX = useMotionValue(0);
	const fileY = useMotionValue(0);
	const handX = useMotionValue(HAND_IN_X);
	const handY = useMotionValue(HAND_IN_Y);

	const [live, setLive] = useState(true);
	const [matched, setMatched] = useState(false);
	const [zephUrl, setZephUrl] = useState(randomZephUrl);

	const { next } = useOnboarding();
	const user = useUser();
	const { t } = useTranslation();
	const reduced = useReducedMotion();

	const demo = useRef<ReturnType<typeof animate> | null>(null);
	const hold = useRef<ReturnType<typeof setTimeout> | null>(null);
	const dragged = useRef(false);
	const dropped = useRef(false);

	const playOnce = useCallback(() => {
		if (reduced) {
			return animate([
				["[data-window]", { opacity: 0 }, { duration: 0 }],
				["[data-glow]", { opacity: 0 }, { duration: 0, at: "<" }],
				[reveal, 0, { duration: 0, at: "<" }],
				["[data-window]", { opacity: 1 }, { duration: 0.25, at: 0.4 }],
				["[data-glow]", { opacity: 1 }, { duration: 0.2, at: "+0.45" }],
				[reveal, 100, { duration: 0.3, at: "<" }],
				["[data-glow]", { opacity: 0 }, { duration: 0.3, at: `+${HOLD}` }],
				[reveal, 0, { duration: 0.25, at: "<" }],
				["[data-window]", { opacity: 0 }, { duration: 0.25, at: "+0.1" }],
			]);
		}

		return animate([
			["[data-window]", { opacity: 0, scale: 0.94, y: 8 }, { duration: 0 }],
			["[data-glow]", { opacity: 0 }, { duration: 0, at: "<" }],
			["[data-file]", { opacity: 1, scale: 1 }, { duration: 0, at: "<" }],
			[fileX, 0, { duration: 0, at: "<" }],
			[fileY, 0, { duration: 0, at: "<" }],
			[reveal, 0, { duration: 0, at: "<" }],
			["[data-hand]", { opacity: 0, scale: 0.9 }, { duration: 0, at: "<" }],
			[handX, HAND_IN_X, { duration: 0, at: "<" }],
			[handY, HAND_IN_Y, { duration: 0, at: "<" }],
			["[data-cursor]", { opacity: 1 }, { duration: 0, at: "<" }],
			["[data-click]", { opacity: 0 }, { duration: 0, at: "<" }],

			[
				"[data-window]",
				{ opacity: 1, scale: 1, y: 0 },
				{ duration: 0.5, at: 0.5, ease: EASE_OUT },
			],

			["[data-hand]", { opacity: 1, scale: 1 }, { duration: 0.3, at: "+0.1" }],
			[handX, HAND_X, { duration: 0.85, at: "<", ease: [0.22, 0.61, 0.36, 1] }],
			[handY, HAND_Y, { duration: 0.85, at: "<", ease: [0.22, 0.61, 0.36, 1] }],
			["[data-cursor]", { opacity: 0 }, { duration: 0.05 }],
			["[data-click]", { opacity: 1 }, { duration: 0.05, at: "<" }],
			["[data-file]", { scale: 0.94 }, { duration: 0.12, at: "<" }],

			[fileX, TRAVEL_X, { duration: 0.95, at: "+0.15", ease: EASE_DRAG }],
			[fileY, TRAVEL_Y, { duration: 0.95, at: "<", ease: EASE_DRAG }],
			[handX, HAND_X + TRAVEL_X, { duration: 0.95, at: "<", ease: EASE_DRAG }],
			[handY, HAND_Y + TRAVEL_Y, { duration: 0.95, at: "<", ease: EASE_DRAG }],
			["[data-glow]", { opacity: 1 }, { duration: 0.25, at: "-0.35" }],

			["[data-click]", { opacity: 0 }, { duration: 0.06 }],
			["[data-cursor]", { opacity: 1 }, { duration: 0.06, at: "<" }],
			["[data-file]", { opacity: 0, scale: 0.82 }, { duration: 0.24, at: "<" }],
			[reveal, 100, { duration: 0.5, at: "<", ease: EASE_OUT }],
			["[data-hand]", { opacity: 0 }, { duration: 0.5, at: "+0.15" }],
			[
				handX,
				HAND_X + TRAVEL_X + 32,
				{ duration: 0.55, at: "<", ease: EASE_OUT },
			],
			[
				handY,
				HAND_Y + TRAVEL_Y + 28,
				{ duration: 0.55, at: "<", ease: EASE_OUT },
			],

			["[data-glow]", { opacity: 0 }, { duration: 0.4, at: `+${HOLD}` }],
			[reveal, 0, { duration: 0.32, at: "<" }],
			[
				"[data-window]",
				{ opacity: 0, scale: 0.96, y: 6 },
				{ duration: 0.35, at: "+0.05" },
			],
		]);
	}, [animate, fileX, fileY, handX, handY, reveal, reduced]);

	const restart = useCallback(() => {
		const controls = animate([
			["[data-glow]", { opacity: 0 }, { duration: 0.35 }],
			[reveal, 0, { duration: 0.3, at: "<" }],
			[
				"[data-window]",
				{ opacity: 0, scale: 0.96, y: 6 },
				{ duration: 0.3, at: "+0.05" },
			],
			["[data-file]", { opacity: 1, scale: 1 }, { duration: 0, at: "+0.05" }],
			[fileX, 0, { duration: 0, at: "<" }],
			[fileY, 0, { duration: 0, at: "<" }],
		]);

		controls.finished
			.then(() => {
				setZephUrl((current) => randomZephUrl(current));
				dragged.current = false;
				dropped.current = false;
				setLive(true);
			})
			.catch(() => undefined);
	}, [animate, fileX, fileY, reveal]);

	const takeOver = useCallback(() => {
		if (hold.current) clearTimeout(hold.current);
		demo.current?.stop();
		setLive(false);

		animate([
			["[data-hand]", { opacity: 0 }, { duration: 0.15 }],
			[
				"[data-window]",
				{ opacity: 1, scale: 1, y: 0 },
				{ duration: 0.3, at: "<", ease: EASE_OUT },
			],
		]);
	}, [animate]);

	const land = useCallback(() => {
		if (dropped.current) return;
		dropped.current = true;

		const controls = animate([
			["[data-file]", { opacity: 0, scale: 0.82 }, { duration: 0.22 }],
			["[data-glow]", { opacity: 1 }, { duration: 0.2, at: "<" }],
			[reveal, 100, { duration: 0.45, at: "<", ease: EASE_OUT }],
		]);

		controls.finished
			.then(() => {
				hold.current = setTimeout(restart, USER_HOLD);
			})
			.catch(() => undefined);
	}, [animate, restart, reveal]);

	const onDragStart = useCallback(() => {
		dragged.current = true;
		takeOver();
		animate("[data-file]", { scale: 0.94 }, { duration: 0.12 });
	}, [animate, takeOver]);

	const onDragEnd = useCallback(
		(_event: MouseEvent | TouchEvent | PointerEvent, info: PanInfo) => {
			const bounds = zone.current?.getBoundingClientRect();
			const x = info.point.x - window.scrollX;
			const y = info.point.y - window.scrollY;

			const inside =
				!!bounds &&
				x >= bounds.left &&
				x <= bounds.right &&
				y >= bounds.top &&
				y <= bounds.bottom;

			if (inside) {
				land();
				return;
			}

			animate([
				["[data-file]", { scale: 1 }, { duration: 0.2 }],
				[fileX, 0, { type: "spring", bounce: 0.25, duration: 0.45, at: "<" }],
				[fileY, 0, { type: "spring", bounce: 0.25, duration: 0.45, at: "<" }],
			]);
			hold.current = setTimeout(restart, MISS_HOLD);
		},
		[animate, fileX, fileY, land, restart],
	);

	const onPointerDown = useCallback(() => {
		dragged.current = false;
	}, []);

	const onTap = useCallback(() => {
		if (dragged.current || dropped.current) return;

		takeOver();
		animate([
			["[data-file]", { scale: 0.94 }, { duration: 0.12 }],
			[fileX, TRAVEL_X, { duration: 0.5, at: "<", ease: EASE_DRAG }],
			[fileY, TRAVEL_Y, { duration: 0.5, at: "<", ease: EASE_DRAG }],
		])
			.finished.then(land)
			.catch(() => undefined);
	}, [animate, fileX, fileY, land, takeOver]);

	const onShortcutMatch = useCallback(() => setMatched(true), []);

	useEffect(() => {
		if (!live) return;

		let cancelled = false;

		const loop = () => {
			if (cancelled) return;

			const controls = playOnce();
			demo.current = controls;
			controls.finished
				.then(() => {
					if (!cancelled) loop();
				})
				.catch(() => undefined);
		};

		loop();

		return () => {
			cancelled = true;
			demo.current?.stop();
		};
	}, [live, playOnce]);

	useEffect(
		() => () => {
			if (hold.current) clearTimeout(hold.current);
		},
		[],
	);

	return (
		<MotionConfig reducedMotion="user">
			<motion.div
				ref={scope}
				variants={rootVariants}
				initial="initial"
				animate="animate"
				exit="exit"
				className="relative flex h-full w-full flex-col items-center justify-center"
			>
				<div className="flex w-xl flex-col items-center justify-center gap-4">
					<motion.div
						variants={itemVariants}
						ref={scene}
						className="relative h-36 w-80"
					>
						<motion.div
							data-window
							initial={{ opacity: 0, scale: 0.94, y: 8 }}
							className="absolute top-4 right-0 flex h-28 w-44 flex-col overflow-hidden rounded-xl border border-border bg-background-popup/80 shadow-lg backdrop-blur-sm"
						>
							<div className="flex h-5 shrink-0 items-center gap-1.5 border-border/70 border-b px-2">
								<span className="size-1.5 rounded-full bg-zephyr" />
								<span className="font-mono text-[9px] text-muted/70 uppercase tracking-wider">
									Zephyr
								</span>
							</div>
							<div className="min-h-0 flex-1 p-1.5">
								<div
									ref={zone}
									className="relative flex h-full w-full flex-col items-center justify-center gap-1 rounded-lg border border-border border-dashed"
								>
									<div
										data-glow
										className="pointer-events-none absolute inset-0 rounded-lg border border-zephyr bg-zephyr/10 opacity-0"
										style={{ filter: "url(#phosphor-soft)" }}
									/>
									<div className="relative flex size-10 items-center justify-center">
										<FileFolderPixel
											className="size-6 text-muted/40"
											style={{ filter: "url(#phosphor-soft)" }}
										/>
										<motion.div
											style={{ clipPath, filter: "url(#phosphor-soft)" }}
											className="absolute inset-0 flex items-center justify-center rounded-lg bg-zephyr"
										>
											<img src={zephUrl} alt="" className="size-7" />
										</motion.div>
									</div>
									<p className="relative text-[10px] text-muted/70">
										{t("onboarding:share_shortcut_linux_drop")}
									</p>
								</div>
							</div>
						</motion.div>

						<motion.button
							type="button"
							data-file
							drag
							dragConstraints={scene}
							dragElastic={0.12}
							dragMomentum={false}
							onPointerDown={onPointerDown}
							onDragStart={onDragStart}
							onDragEnd={onDragEnd}
							onTap={onTap}
							style={{ x: fileX, y: fileY }}
							aria-label={t("onboarding:share_shortcut_linux_drag_file")}
							className="absolute top-12 left-2 z-20 flex size-12 cursor-grab items-center justify-center active:cursor-grabbing"
						>
							<FileFolderPixel
								className="size-8 text-white"
								style={{ filter: "url(#phosphor-soft)" }}
							/>
						</motion.button>

						<motion.div
							data-hand
							initial={{ opacity: 0, scale: 0.9 }}
							style={{ x: handX, y: handY }}
							className="pointer-events-none absolute top-12 left-2 z-30 size-9"
						>
							<CursorHand
								data-cursor
								className="absolute inset-0 size-9 text-black"
							/>
							<CursorHandClick
								data-click
								className="absolute inset-0 size-9 -translate-x-[3px] text-black opacity-0"
							/>
						</motion.div>
					</motion.div>
					<motion.p variants={itemVariants} className="font-medium text-2xl">
						{t("onboarding:share_shortcut_linux_title")}
					</motion.p>
					<div>
						<motion.p
							variants={itemVariants}
							className="text-center text-muted"
						>
							{t("onboarding:share_shortcut_linux_description")}
						</motion.p>
						<motion.p
							variants={itemVariants}
							className="text-center text-muted"
						>
							{t("onboarding:share_shortcut_linux_description_press")}
						</motion.p>
					</div>
					<motion.div variants={itemVariants}>
						<ShortcutKeycaps
							shortcut={user?.shortcuts.share}
							size={88}
							listen={!matched}
							confirmed={matched}
							pauseGlobalShortcuts
							onMatch={onShortcutMatch}
							onConfirmedEnd={next}
						/>
					</motion.div>
					<motion.div
						variants={itemVariants}
						className="h-4 max-h-4 overflow-hidden"
					>
						<AnimatePresence initial={false} mode="popLayout">
							<motion.p
								key={matched ? "shortcut_success_message" : "shortcut_hint"}
								className="text-center text-muted/60 text-xs"
								initial={{ opacity: 0, y: -14 }}
								animate={{ opacity: 1, y: 0 }}
								exit={{ opacity: 0, y: 14 }}
								transition={{ duration: 0.3, ease: EASE_OUT }}
							>
								{matched
									? t("onboarding:share_shortcut_success")
									: t("onboarding:share_shortcut_hint")}
							</motion.p>
						</AnimatePresence>
					</motion.div>
				</div>
			</motion.div>
		</MotionConfig>
	);
};
