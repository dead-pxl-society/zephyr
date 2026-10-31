import { useReducedMotion } from "motion/react";
import { type ComponentPropsWithoutRef, memo, useEffect, useRef } from "react";
import { cn } from "@/lib/utils";

const TWO_PI = Math.PI * 2;

/**
 * Dot anchors live in one flat Float32Array (x, y pairs) rather than an array
 * of objects: a full window of them is a few thousand entries walked on every
 * draw, and the flat buffer keeps that walk cache friendly and allocation free.
 */
const STRIDE = 2;

/**
 * Canvas colors are parsed by the canvas, not by CSS, so `var(--zephyr)` and
 * relative color syntax never resolve there. Bouncing the value through an
 * element's computed `color` hands us a concrete color the canvas understands.
 */
const resolveColor = (el: HTMLElement, value: string) => {
	if (!value.includes("var(") && !value.includes("from ")) return value;
	const previous = el.style.color;
	el.style.color = value;
	const resolved = getComputedStyle(el).color;
	el.style.color = previous;
	return resolved || value;
};

interface DotGridProps extends ComponentPropsWithoutRef<"div"> {
	dotRadius?: number;
	dotSpacing?: number;
	sparkle?: boolean;
	waveAmplitude?: number;
	gradientFrom?: string;
	gradientTo?: string;
}

export const DotGrid = memo(
	({
		dotRadius = 1.5,
		dotSpacing = 14,
		sparkle = false,
		waveAmplitude = 0,
		gradientFrom = "oklch(from var(--foreground) l c h / 0.15)",
		gradientTo = "oklch(from var(--zephyr) l c h / 0.2)",
		className,
		...rest
	}: DotGridProps) => {
		const rootRef = useRef<HTMLDivElement>(null);
		const canvasRef = useRef<HTMLCanvasElement>(null);
		const reduceMotion = useReducedMotion();

		useEffect(() => {
			const root = rootRef.current;
			const canvas = canvasRef.current;
			if (!root || !canvas) return;
			const ctx = canvas.getContext("2d", { alpha: true });
			if (!ctx) return;

			// Reduced motion still gets the grid, it just never animates.
			const wave = reduceMotion ? 0 : waveAmplitude;
			const twinkle = reduceMotion ? false : sparkle;
			const animated = wave > 0 || twinkle;

			const step = dotRadius + dotSpacing;
			const radius = dotRadius / 2;

			let dots = new Float32Array(0);
			let gradient: CanvasGradient | null = null;
			let width = 0;
			let height = 0;
			let frame = 0;

			let raf = 0;
			let resizeRaf = 0;
			let running = false;
			let onScreen = true;

			const build = () => {
				const cols = Math.max(Math.floor(width / step), 0);
				const rows = Math.max(Math.floor(height / step), 0);
				const length = cols * rows * STRIDE;
				// Reuse the buffer whenever a resize lands on the same dot count.
				if (dots.length !== length) dots = new Float32Array(length);

				const baseX = (width % step) / 2 + step / 2;
				const baseY = (height % step) / 2 + step / 2;
				let i = 0;

				for (let row = 0; row < rows; row++) {
					const y = baseY + row * step;
					for (let col = 0; col < cols; col++) {
						dots[i] = baseX + col * step;
						dots[i + 1] = y;
						i += STRIDE;
					}
				}
			};

			const render = () => {
				ctx.clearRect(0, 0, width, height);
				if (gradient) ctx.fillStyle = gradient;
				// One path for every dot, so the whole grid is a single fill.
				ctx.beginPath();

				const t = frame * 0.02;
				const length = dots.length;

				for (let i = 0; i < length; i += STRIDE) {
					const ax = dots[i];
					const ay = dots[i + 1];
					let x = ax;
					let y = ay;

					if (wave > 0) {
						y += Math.sin(ax * 0.03 + t) * wave;
						x += Math.cos(ay * 0.03 + t * 0.7) * wave * 0.5;
					}

					const sparkling =
						twinkle &&
						((Math.imul(i, 2654435761) ^ (frame >> 3)) >>> 0) % 100 < 3;
					const r = sparkling ? radius * 1.8 : radius;

					ctx.moveTo(x + r, y);
					ctx.arc(x, y, r, 0, TWO_PI);
				}

				ctx.fill();
			};

			const tick = () => {
				if (!onScreen) {
					running = false;
					return;
				}
				frame++;
				render();
				raf = requestAnimationFrame(tick);
			};

			const start = () => {
				if (!animated || running || !onScreen) return;
				running = true;
				raf = requestAnimationFrame(tick);
			};

			const resize = () => {
				// `offsetWidth`/`offsetHeight` rather than `getBoundingClientRect`:
				// the grid can mount while an ancestor is mid layout animation, and
				// a transformed ancestor makes the bounding rect report the scaled
				// size, which would size the canvas to a box the grid never occupies.
				// The layout box is also what ResizeObserver reports, so the initial
				// measurement and every later one agree.
				const nextWidth = root.offsetWidth;
				const nextHeight = root.offsetHeight;
				if (!nextWidth || !nextHeight) return;

				width = nextWidth;
				height = nextHeight;
				const dpr = Math.min(window.devicePixelRatio || 1, 2);

				canvas.width = Math.round(width * dpr);
				canvas.height = Math.round(height * dpr);
				canvas.style.width = `${width}px`;
				canvas.style.height = `${height}px`;
				// Resizing the backing store resets all context state, so the
				// cached gradient is rebuilt here instead of once per frame.
				ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
				gradient = ctx.createLinearGradient(0, 0, width, height);
				gradient.addColorStop(0, resolveColor(root, gradientFrom));
				gradient.addColorStop(1, resolveColor(root, gradientTo));

				build();
				render();
				start();
			};

			const scheduleResize = () => {
				if (resizeRaf) return;
				resizeRaf = requestAnimationFrame(() => {
					resizeRaf = 0;
					resize();
				});
			};

			const onVisibilityChange = () => {
				onScreen = !document.hidden;
				start();
			};

			const resizeObserver = new ResizeObserver(scheduleResize);
			resize();
			resizeObserver.observe(root);
			window.addEventListener("resize", scheduleResize);

			// A static grid is drawn once per resize and costs nothing after
			// that, so only the animated variants need pausing when hidden.
			let intersectionObserver: IntersectionObserver | undefined;
			if (animated) {
				intersectionObserver = new IntersectionObserver((entries) => {
					onScreen = entries[0].isIntersecting && !document.hidden;
					start();
				});
				intersectionObserver.observe(root);
				document.addEventListener("visibilitychange", onVisibilityChange);
			}

			return () => {
				cancelAnimationFrame(raf);
				cancelAnimationFrame(resizeRaf);
				resizeObserver.disconnect();
				intersectionObserver?.disconnect();
				window.removeEventListener("resize", scheduleResize);
				document.removeEventListener("visibilitychange", onVisibilityChange);
			};
		}, [
			dotRadius,
			dotSpacing,
			sparkle,
			waveAmplitude,
			gradientFrom,
			gradientTo,
			reduceMotion,
		]);

		return (
			<div
				ref={rootRef}
				aria-hidden="true"
				className={cn("pointer-events-none relative h-full w-full", className)}
				{...rest}
			>
				<canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />
			</div>
		);
	},
);

DotGrid.displayName = "DotGrid";
