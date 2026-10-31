import {
	animate as animateValue,
	type Easing,
	motion,
	useAnimate,
	useMotionTemplate,
	useMotionValue,
} from "motion/react";
import { useCallback, useEffect, useRef } from "react";
import logoUrl from "@/assets/icons/logo-pixel.avif";
import wordmarkUrl from "@/assets/icons/retro-zephyr.svg";

const EASE_OUT: [number, number, number, number] = [0.16, 1, 0.3, 1];

/** Every beat of the sequence, in seconds, so the whole thing tunes from here. */
const BEAM_S = 0.13;
const TUBE_S = 0.2;
const FLASH_S = 0.22;
const RASTER_S = 1.2;
const LOCKED_S = 0.5;
const RENDER_S = 1.1;
const HOLD_S = 1.2;
const HANDOFF_S = 0.4;
/**
 * The tube shrinks to this as it leaves, and the onboarding grows from it back
 * to 1, so the handoff reads as one continuous move rather than two.
 */
export const HANDOFF_SCALE = 0.94;
const SKIP_HANDOFF_S = 0.18;

/**
 * One scanline: how thick the lit band is, and how much dark sits under it.
 * The reveal steps in whole scanlines, so the beam uncovers exactly one line at
 * a time and the artwork lands on the same grid the background is drawn on.
 */
const SCANLINE_PX = 3;
const SCANLINE_GAP_PX = 5;
const SCAN_PITCH_PX = SCANLINE_PX + SCANLINE_GAP_PX;

const LOGO_H = 120;
const LOGO_W = Math.round((657 / 1121) * LOGO_H);
const WORDMARK_H = 64;
const WORDMARK_W = Math.round((1655 / 438) * WORDMARK_H);

const LOGO_STEPS = Math.round(LOGO_H / SCAN_PITCH_PX);
const WORDMARK_STEPS = Math.round(WORDMARK_H / SCAN_PITCH_PX);

/**
 * The raster hunting for vertical lock. A CRT rolls when its vertical
 * oscillator runs off the sync signal — down when slow, up when fast — and
 * during warm-up it drifts through the lock point, so the roll reverses and
 * overshoots in shrinking swings before it settles. The first leg is fast
 * enough to alias, which is what makes a real one look like it is going both
 * ways at once. The pattern repeats every scanline, so the value it lands on
 * is arbitrary.
 */
const RASTER_KEYFRAMES = [0, 640, 448, 552, 504, 528];
const RASTER_TIMES = [0, 0.4, 0.62, 0.79, 0.92, 1];
const RASTER_EASE: Easing[] = [
	"linear",
	"easeOut",
	"easeInOut",
	"easeInOut",
	"easeOut",
];

/**
 * Quantizes progress into n discrete jumps. A curve would read as a modern
 * wipe; a staircase reads as a beam painting one line at a time.
 */
const stepped = (n: number) => (t: number) => Math.ceil(t * n) / n;

/**
 * The tube keeps the dark palette in both themes. That is not only a taste
 * call: the phosphor filters build their glow out of screen blends, which can
 * only ever add light, so the aberration and bloom simply do not register on a
 * light surface. The value is the app's own dark-theme surface, so in dark mode
 * the handoff into onboarding is still an exact color match.
 */
const TUBE_BG = "oklch(0.0247 0 272)";

/** CRT light. Fixed white, since the tube behind it is always dark. */
const lit = (alpha: number) => `rgb(255 255 255 / ${alpha})`;

const SCANLINES = `repeating-linear-gradient(to bottom, ${lit(0.07)} 0 ${SCANLINE_PX}px, transparent ${SCANLINE_PX}px ${SCAN_PITCH_PX}px)`;
const ROLL = `linear-gradient(to bottom, transparent 0%, ${lit(0.04)} 50%, transparent 100%)`;
const VIGNETTE =
	"radial-gradient(ellipse at center, transparent 45%, rgb(0 0 0 / 0.35) 100%)";
const GRAIN =
	"url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.8' numOctaves='3'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E\")";

const decode = (src: string) => {
	const image = new Image();
	image.src = src;
	return image.decode().catch(() => undefined);
};

interface CrtSplashProps {
	/**
	 * Fires as the tube starts fading, not when it is gone. The onboarding
	 * mounts on this and blurs in underneath, so the two halves overlap
	 * instead of cutting.
	 */
	onExitStart: () => void;
	onDone: () => void;
}

export const CrtSplash = ({ onExitStart, onDone }: CrtSplashProps) => {
	const [scope, animate] = useAnimate();

	/** Bottom inset of each clip, 100 (nothing drawn) down to 0 (fully drawn). */
	const logoReveal = useMotionValue(100);
	const wordmarkReveal = useMotionValue(100);

	/** Vertical offset of the scanline field while it hunts for lock. */
	const rasterY = useMotionValue(0);

	const logoClip = useMotionTemplate`inset(0 0 ${logoReveal}% 0)`;
	const wordmarkClip = useMotionTemplate`inset(0 0 ${wordmarkReveal}% 0)`;

	const cancelled = useRef(false);
	const skipped = useRef(false);
	const timers = useRef<number[]>([]);
	const running = useRef<{ stop: () => void }[]>([]);
	const onDoneRef = useRef(onDone);
	const onExitStartRef = useRef(onExitStart);

	useEffect(() => {
		onDoneRef.current = onDone;
		onExitStartRef.current = onExitStart;
	}, [onDone, onExitStart]);

	/** A sleep that a cleanup or a skip can cut short. */
	const wait = useCallback(
		(seconds: number) =>
			new Promise<void>((resolve) => {
				const id = window.setTimeout(resolve, seconds * 1000);
				timers.current.push(id);
			}),
		[],
	);

	const track = useCallback(<T extends { stop: () => void }>(controls: T) => {
		running.current.push(controls);
		return controls;
	}, []);

	const skip = useCallback(() => {
		if (skipped.current || cancelled.current) return;
		skipped.current = true;

		for (const controls of running.current) controls.stop();
		running.current = [];
		for (const id of timers.current) window.clearTimeout(id);
		timers.current = [];

		// Land on the fully-drawn frame rather than cutting to a blank tube.
		logoReveal.set(0);
		wordmarkReveal.set(0);
		rasterY.set(RASTER_KEYFRAMES[RASTER_KEYFRAMES.length - 1]);

		onExitStartRef.current();

		const out = animate(
			scope.current,
			{
				opacity: [1, 0],
				scale: [1, HANDOFF_SCALE],
				filter: ["blur(0px)", "blur(8px)"],
			},
			{ duration: SKIP_HANDOFF_S, ease: "easeOut" },
		);
		out.finished
			.then(() => {
				if (!cancelled.current) onDoneRef.current();
			})
			.catch(() => undefined);
	}, [animate, scope, logoReveal, wordmarkReveal, rasterY]);

	useEffect(() => {
		cancelled.current = false;
		skipped.current = false;

		const play = async () => {
			// Power on: the beam strikes, then the tube opens out from it.
			const powerOn = track(
				animate([
					[
						"[data-beam]",
						{ scaleX: [0, 1], opacity: [0, 1] },
						{ duration: BEAM_S, ease: EASE_OUT },
					],
					[
						"[data-tube]",
						{ scaleY: [0.006, 1] },
						{ duration: TUBE_S, ease: EASE_OUT, at: BEAM_S },
					],
					[
						"[data-beam]",
						{ opacity: 0 },
						{ duration: 0.15, at: BEAM_S + 0.02 },
					],
					[
						"[data-flash]",
						{ opacity: [0.55, 0] },
						{ duration: FLASH_S, at: BEAM_S + 0.07 },
					],
				]),
			);
			await powerOn.finished.catch(() => undefined);
			if (cancelled.current || skipped.current) return;

			// The raster comes up rolling and hunts for vertical lock.
			const raster = track(
				animateValue(rasterY, RASTER_KEYFRAMES, {
					duration: RASTER_S,
					times: RASTER_TIMES,
					ease: RASTER_EASE,
				}),
			);
			await raster.finished.catch(() => undefined);
			if (cancelled.current || skipped.current) return;

			// Locked, but still empty — the beat before anything is drawn.
			await wait(LOCKED_S);
			if (cancelled.current || skipped.current) return;

			// Both assets are tiny, but decoding up front guarantees the scan never
			// paints across an image the browser has not finished decoding.
			await Promise.all([decode(logoUrl), decode(wordmarkUrl)]);
			if (cancelled.current || skipped.current) return;

			// Render: one duration, two step counts, so they start and finish
			// together while keeping the same scan pitch.
			const logo = track(
				animateValue(logoReveal, 0, {
					duration: RENDER_S,
					ease: stepped(LOGO_STEPS),
				}),
			);
			const wordmark = track(
				animateValue(wordmarkReveal, 0, {
					duration: RENDER_S,
					ease: stepped(WORDMARK_STEPS),
				}),
			);
			await Promise.all(
				[logo, wordmark].map((controls) =>
					controls.finished.catch(() => undefined),
				),
			);
			if (cancelled.current || skipped.current) return;

			await wait(HOLD_S);
			if (cancelled.current || skipped.current) return;

			// Hand off: the tube blurs and lifts away while the onboarding blurs
			// in underneath it.
			onExitStartRef.current();
			const out = track(
				animate(
					scope.current,
					{
						opacity: [1, 0],
						scale: [1, HANDOFF_SCALE],
						filter: ["blur(0px)", "blur(8px)"],
					},
					{ duration: HANDOFF_S, ease: "easeInOut" },
				),
			);
			await out.finished.catch(() => undefined);
			if (cancelled.current || skipped.current) return;

			onDoneRef.current();
		};

		play();

		return () => {
			cancelled.current = true;
			for (const controls of running.current) controls.stop();
			running.current = [];
			for (const id of timers.current) window.clearTimeout(id);
			timers.current = [];
		};
	}, [animate, scope, track, wait, logoReveal, wordmarkReveal, rasterY]);

	useEffect(() => {
		const onKeyDown = () => skip();
		window.addEventListener("keydown", onKeyDown);
		return () => window.removeEventListener("keydown", onKeyDown);
	}, [skip]);

	return (
		<div
			ref={scope}
			onPointerDown={skip}
			className="absolute inset-0 z-50 p-2"
			aria-hidden="true"
		>
			<div
				className="relative h-full w-full overflow-hidden rounded-lg"
				style={{ background: TUBE_BG }}
			>
				<motion.div
					data-tube
					className="absolute inset-0 animate-[crt-flicker_140ms_steps(3,end)_infinite]"
					style={{ scaleY: 0.006 }}
				>
					<motion.div
						className="absolute inset-x-0 -top-[200%] h-[500%]"
						style={{ backgroundImage: SCANLINES, y: rasterY }}
					/>
					<div
						className="absolute inset-x-0 top-0 h-[28%] animate-[crt-roll_7s_linear_infinite]"
						style={{ background: ROLL }}
					/>
					<div className="absolute inset-0" style={{ background: VIGNETTE }} />
					<div
						className="absolute inset-0 opacity-[0.04]"
						style={{ backgroundImage: GRAIN }}
					/>

					<div className="relative flex h-full w-full flex-col items-center justify-center gap-7">
						<div className="relative" style={{ width: LOGO_W, height: LOGO_H }}>
							<motion.div
								className="absolute inset-0"
								style={{ clipPath: logoClip }}
							>
								<img
									src={logoUrl}
									alt=""
									className="h-full w-full"
									style={{
										filter: "url(#black-key) url(#phosphor-soft)",
									}}
								/>
							</motion.div>
						</div>

						<div
							className="relative"
							style={{ width: WORDMARK_W, height: WORDMARK_H }}
						>
							<motion.div
								className="absolute inset-0"
								style={{ clipPath: wordmarkClip }}
							>
								<img
									src={wordmarkUrl}
									alt="Zephyr"
									className="h-full w-full"
									style={{ filter: "url(#phosphor-soft)" }}
								/>
							</motion.div>
						</div>
					</div>
				</motion.div>

				<div
					data-beam
					className="absolute top-1/2 left-0 h-[2px] w-full opacity-0"
					style={{
						background: lit(0.95),
						boxShadow: `0 0 12px 2px ${lit(0.6)}`,
					}}
				/>
				<div
					data-flash
					className="absolute inset-0 opacity-0"
					style={{ background: lit(1) }}
				/>
			</div>
		</div>
	);
};

export default CrtSplash;
