import {
	AnimatePresence,
	MotionConfig,
	motion,
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
import { VintageMac } from "@/components/onboarding/vintage-mac";
import { ShortcutKeycaps } from "@/components/shortcut-keycaps";
import { useUser } from "@/lib/store/user";
import { randomZephUrl } from "@/lib/zephs";
import { useOnboarding } from "../use-onboarding";

const EASE_OUT: [number, number, number, number] = [0.16, 1, 0.3, 1];

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

export const ShareShortcutStep = () => {
	const [scope, animate] = useAnimate();
	const reveal = useMotionValue(0);
	const clipPath = useMotionTemplate`circle(${reveal}% at 50% 50%)`;

	const [selected, setSelected] = useState(false);
	const [matched, setMatched] = useState(false);
	const [zephUrl, setZephUrl] = useState(randomZephUrl);

	const { next } = useOnboarding();
	const user = useUser();
	const { t } = useTranslation();
	const reduced = useReducedMotion();
	const demo = useRef<ReturnType<typeof animate> | null>(null);

	const select = useCallback(
		(delay: number) => {
			if (reduced) {
				const settle = animate(reveal, 100, {
					duration: 0.2,
					delay,
					ease: EASE_OUT,
				});
				settle.finished.then(() => setSelected(true)).catch(() => undefined);

				return settle;
			}

			const controls = animate([
				[
					"[data-hand]",
					{ opacity: 0, scale: 0.9, x: 128, y: 62 },
					{ duration: 0 },
				],
				["[data-cursor]", { opacity: 1 }, { duration: 0, at: "<" }],
				["[data-click]", { opacity: 0 }, { duration: 0, at: "<" }],
				[
					"[data-hand]",
					{ opacity: 1, scale: 1, x: -10, y: -2 },
					{
						duration: 0.9,
						at: delay,
						ease: [0.22, 0.61, 0.36, 1],
						opacity: { duration: 0.3 },
					},
				],
				["[data-cursor]", { opacity: 0 }, { duration: 0.05 }],
				["[data-click]", { opacity: 1 }, { duration: 0.05, at: "<" }],
				["[data-file]", { scale: 0.97 }, { duration: 0.09, at: "<" }],
				["[data-hand]", { scale: 1 }, { duration: 0.18, at: "+0.1" }],
				[
					"[data-file]",
					{ scale: 1 },
					{ duration: 0.28, at: "<", type: "spring", bounce: 0.4 },
				],
				["[data-click]", { opacity: 0 }, { duration: 0.08, at: "<" }],
				["[data-cursor]", { opacity: 1 }, { duration: 0.08, at: "<" }],
				[reveal, 100, { duration: 0.5, at: "<", ease: [0.16, 1, 0.3, 1] }],
				[
					"[data-hand]",
					{ opacity: 0, x: 34, y: 26 },
					{ duration: 0.55, at: "+0.35", ease: EASE_OUT },
				],
			]);

			controls.finished.then(() => setSelected(true)).catch(() => undefined);

			return controls;
		},
		[animate, reveal, reduced],
	);

	const deselect = useCallback(() => {
		setSelected(false);

		const controls = reduced
			? animate(reveal, 0, { duration: 0.15, ease: EASE_OUT })
			: animate([
					["[data-file]", { scale: 0.97 }, { duration: 0.09 }],
					[reveal, 0, { duration: 0.32, at: "<", ease: [0.4, 0, 1, 1] }],
					[
						"[data-file]",
						{ scale: 1 },
						{ duration: 0.3, type: "spring", bounce: 0.4 },
					],
				]);

		demo.current = controls;
		controls.finished
			.then(() => {
				setZephUrl((current) => randomZephUrl(current));
				select(reduced ? 0.1 : 0.45);
			})
			.catch(() => undefined);
	}, [animate, reveal, select, reduced]);

	const onFileClick = useCallback(() => {
		if (selected) {
			deselect();
			return;
		}

		demo.current?.stop();
		reveal.set(100);
		setSelected(true);
		animate("[data-hand]", { opacity: 0 }, { duration: 0.15 });
	}, [animate, deselect, reveal, selected]);

	const onShortcutMatch = useCallback(() => setMatched(true), []);

	useEffect(() => {
		const controls = select(0.5);
		demo.current = controls;

		return () => controls.stop();
	}, [select]);

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
					<motion.div variants={itemVariants} className="relative h-28">
						<div className="absolute -top-5 -left-10">
							<VintageMac
								className="size-32"
								style={{ filter: "url(#phosphor-soft)" }}
							/>
						</div>
						<motion.button
							type="button"
							data-file
							onClick={onFileClick}
							whileTap={{ scale: 0.97 }}
							aria-label={
								selected
									? t("onboarding:share_shortcut_deselect_file")
									: t("onboarding:share_shortcut_select_file")
							}
							className="relative flex h-12 w-12 cursor-pointer items-center justify-center"
						>
							<FileFolderPixel
								className="h-8 w-8 text-white"
								style={{ filter: "url(#phosphor-soft)" }}
							/>
							<motion.div
								style={{ clipPath, filter: "url(#phosphor-soft)" }}
								className="absolute inset-0 flex items-center justify-center rounded-lg bg-zephyr"
							>
								<img src={zephUrl} alt="" className="h-8 w-8" />
							</motion.div>
						</motion.button>
						<motion.div
							data-hand
							initial={{ opacity: 0, scale: 0.9, x: 128, y: 62 }}
							className="pointer-events-none absolute top-6 left-6 size-9"
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
						{t("onboarding:share_shortcut_title")}
					</motion.p>
					<div>
						<motion.p
							variants={itemVariants}
							className="text-center text-muted"
						>
							{t("onboarding:share_shortcut_description")}
						</motion.p>
						<motion.p
							variants={itemVariants}
							className="text-center text-muted"
						>
							{t("onboarding:share_shortcut_description_press")}
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
