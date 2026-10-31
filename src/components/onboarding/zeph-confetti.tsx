import { type Easing, motion, steps, useReducedMotion } from "motion/react";
import { type ComponentType, type SVGProps, useState } from "react";
import useMeasure from "react-use-measure";
import { cn } from "@/lib/utils";
import { randomZephColor, randomZephUrl } from "@/lib/zephs";
import { randomConfettiShape } from "./confetti-shapes";

const LAUNCH_EASE: Easing = [0.16, 1, 0.3, 1];
const FALL_EASE: Easing = [0.5, 0, 0.95, 0.6];

const BURST_COUNT = 22;
const DRIFT_COUNT = 7;

const BURST_SHAPE_CHANCE = 0.6;
const DRIFT_SHAPE_CHANCE = 0.35;

const NEAR_ALPHA = 0.72;

const rand = (min: number, max: number) => min + Math.random() * (max - min);

interface Sprite {
	zeph?: string;
	Shape?: ComponentType<SVGProps<SVGSVGElement>>;
	color?: string;
	scale: number;
	spinRate: number;
}

const makeSprite = (shapeChance: number): Sprite =>
	Math.random() < shapeChance
		? {
				Shape: randomConfettiShape(),
				color: randomZephColor(),
				scale: 0.78,
				spinRate: 1.5,
			}
		: { zeph: randomZephUrl(), scale: 1, spinRate: 1 };

const SpriteMark = ({ sprite, size }: { sprite: Sprite; size: number }) => {
	const drawn = size * sprite.scale;
	const { Shape } = sprite;

	if (Shape) {
		return (
			<Shape
				className="block"
				style={{ width: drawn, height: drawn, color: sprite.color }}
			/>
		);
	}

	return (
		<img
			src={sprite.zeph}
			alt=""
			className="block"
			style={{ width: drawn, height: drawn }}
		/>
	);
};

interface Burst {
	id: string;
	sprite: Sprite;
	size: number;
	alpha: number;
	dx: number;
	peak: number;
	spin: number;
	delay: number;
	duration: number;
}

interface Drift {
	id: string;
	sprite: Sprite;
	size: number;
	alpha: number;
	left: number;
	sway: number;
	spin: number;
	delay: number;
	duration: number;
	repeatDelay: number;
}

const depth = (size: number) => 0.45 + ((size - 18) / 20) * 0.55;

const makeBurst = (index: number): Burst => {
	const sprite = makeSprite(BURST_SHAPE_CHANCE);
	const size = rand(18, 38);

	return {
		id: `burst-${index}`,
		sprite,
		size,
		alpha: depth(size),
		dx: rand(0.08, 0.46) * (Math.random() < 0.5 ? -1 : 1),
		peak: rand(0.4, 0.95),
		spin: rand(-240, 240) * sprite.spinRate,
		delay: rand(0, 0.16),
		duration: rand(1.7, 2.6),
	};
};

const makeDrift = (index: number): Drift => {
	const sprite = makeSprite(DRIFT_SHAPE_CHANCE);
	const size = rand(16, 26);

	return {
		id: `drift-${index}`,
		sprite,
		size,
		alpha: depth(size),
		left: rand(0.04, 0.96),
		sway: rand(14, 42) * (Math.random() < 0.5 ? -1 : 1),
		spin: rand(-90, 90) * sprite.spinRate,
		delay: rand(0.6, 2.4),
		duration: rand(4.5, 7),
		repeatDelay: rand(0.4, 3),
	};
};

const BurstPiece = ({
	piece,
	width,
	height,
}: {
	piece: Burst;
	width: number;
	height: number;
}) => (
	<motion.div
		className="absolute bottom-8 left-1/2"
		style={{ marginLeft: -piece.size / 2 }}
		initial={{ x: 0, y: 0, opacity: 0, scale: 0.5 }}
		animate={{
			x: [0, piece.dx * width * 0.62, piece.dx * width],
			y: [0, -piece.peak * height, height * 0.4 + piece.size],
			rotate: [0, piece.spin],
			opacity: [0, piece.alpha, piece.alpha, 0],
			scale: [0.5, 1],
		}}
		transition={{
			duration: piece.duration,
			delay: piece.delay,
			times: [0, 0.34, 1],
			ease: [LAUNCH_EASE, FALL_EASE],
			rotate: {
				duration: piece.duration,
				delay: piece.delay,
				ease: steps(8),
			},
			opacity: {
				duration: piece.duration,
				delay: piece.delay,
				times: [0, 0.05, 0.78, 1],
				ease: "linear",
			},
			scale: {
				duration: 0.26,
				delay: piece.delay,
				ease: LAUNCH_EASE,
			},
		}}
	>
		<SpriteMark sprite={piece.sprite} size={piece.size} />
	</motion.div>
);

const DriftPiece = ({ piece, height }: { piece: Drift; height: number }) => (
	<motion.div
		className="absolute top-0"
		style={{
			left: `${piece.left * 100}%`,
			marginLeft: -piece.size / 2,
		}}
		initial={{ y: -piece.size, opacity: 0 }}
		animate={{
			y: height + piece.size,
			x: [0, piece.sway, -piece.sway * 0.6, 0],
			rotate: [0, piece.spin],
			opacity: [0, piece.alpha, piece.alpha, 0],
		}}
		transition={{
			duration: piece.duration,
			delay: piece.delay,
			repeat: Number.POSITIVE_INFINITY,
			repeatDelay: piece.repeatDelay,
			ease: "linear",
			x: { duration: piece.duration, ease: "easeInOut" },
			rotate: { duration: piece.duration, ease: steps(6) },
			opacity: {
				duration: piece.duration,
				times: [0, 0.12, 0.8, 1],
				ease: "linear",
			},
		}}
	>
		<SpriteMark sprite={piece.sprite} size={piece.size} />
	</motion.div>
);

export const ZephConfetti = ({ className }: { className?: string }) => {
	const [ref, { width, height }] = useMeasure();
	const reduced = useReducedMotion();

	const [layers] = useState(() => {
		const burst = Array.from({ length: BURST_COUNT }, (_, index) =>
			makeBurst(index),
		);
		const drift = Array.from({ length: DRIFT_COUNT }, (_, index) =>
			makeDrift(index),
		);
		const near = (piece: Burst | Drift) => piece.alpha >= NEAR_ALPHA;
		const far = (piece: Burst | Drift) => !near(piece);

		return {
			near: { burst: burst.filter(near), drift: drift.filter(near) },
			far: { burst: burst.filter(far), drift: drift.filter(far) },
		};
	});

	const measured = width > 0 && height > 0;
	const layerClass = cn(
		"pointer-events-none absolute inset-0 overflow-hidden",
		className,
	);

	const render = (pieces: { burst: Burst[]; drift: Drift[] }) => (
		<>
			{pieces.burst.map((piece) => (
				<BurstPiece
					key={piece.id}
					piece={piece}
					width={width}
					height={height}
				/>
			))}
			{pieces.drift.map((piece) => (
				<DriftPiece key={piece.id} piece={piece} height={height} />
			))}
		</>
	);

	const showing = measured && !reduced;

	return (
		<>
			<div ref={ref} aria-hidden="true" className={cn(layerClass, "z-0")}>
				{showing && render(layers.far)}
			</div>
			<div aria-hidden="true" className={cn(layerClass, "z-20")}>
				{showing && render(layers.near)}
			</div>
		</>
	);
};
