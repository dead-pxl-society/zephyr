import { motion, useReducedMotion } from "motion/react";
import { useRef, useState } from "react";
import useMeasure from "react-use-measure";
import { cn } from "@/lib/utils";
import { PaperPlanePixel } from "./paper-plane-pixel";

type Scale = (fraction: number) => number;

interface Leg {
	d: (x: Scale, y: Scale) => string;
	duration: number;
	delay: number;
	flip?: boolean;
}

const flatten = (d: string) => d.replace(/\s+/g, " ").trim();

const LEGS: Leg[] = [
	{
		d: (x, y) =>
			`M ${x(-0.2)} ${y(0.62)}
			 C ${x(0.02)} ${y(0.6)}, ${x(0.24)} ${y(0.47)}, ${x(0.34)} ${y(0.46)}
			 a ${x(0.07)} ${y(0.1) - y(0)} 0 1 0 0 ${y(0) - y(0.2)}
			 a ${x(0.07)} ${y(0.1) - y(0)} 0 1 0 0 ${y(0.2) - y(0)}
			 C ${x(0.46)} ${y(0.46)}, ${x(0.58)} ${y(0.3)}, ${x(0.52)} ${y(-0.2)}`,
		duration: 5.8,
		delay: 0.6,
	},
	{
		d: (x, y) =>
			`M ${x(-0.2)} ${y(0.28)}
			 C ${x(0.15)} ${y(0.18)}, ${x(0.35)} ${y(0.42)}, ${x(0.55)} ${y(0.36)}
			 C ${x(0.75)} ${y(0.3)}, ${x(0.95)} ${y(0.18)}, ${x(1.25)} ${y(0.24)}`,
		duration: 5.4,
		delay: 0.9,
	},
	{
		d: (x, y) =>
			`M ${x(0.66)} ${y(-0.2)}
			 C ${x(0.66)} ${y(0.14)}, ${x(0.58)} ${y(0.3)}, ${x(0.72)} ${y(0.44)}
			 C ${x(0.84)} ${y(0.56)}, ${x(1.0)} ${y(0.52)}, ${x(1.25)} ${y(0.38)}`,
		duration: 4.0,
		delay: 0.8,
	},
	{
		d: (x, y) =>
			`M ${x(1.25)} ${y(0.9)}
			 C ${x(0.95)} ${y(0.92)}, ${x(0.78)} ${y(0.7)}, ${x(0.74)} ${y(0.52)}
			 C ${x(0.7)} ${y(0.34)}, ${x(0.86)} ${y(0.16)}, ${x(0.8)} ${y(-0.2)}`,
		duration: 5.0,
		delay: 0.8,
		flip: true,
	},
	{
		d: (x, y) =>
			`M ${x(1.25)} ${y(0.56)}
			 C ${x(0.96)} ${y(0.66)}, ${x(0.8)} ${y(0.84)}, ${x(0.58)} ${y(0.78)}
			 C ${x(0.36)} ${y(0.72)}, ${x(0.0)} ${y(0.6)}, ${x(-0.22)} ${y(0.62)}`,
		duration: 5.2,
		delay: 1.0,
		flip: true,
	},
	{
		d: (x, y) =>
			`M ${x(0.42)} ${y(-0.2)}
			 C ${x(0.44)} ${y(0.12)}, ${x(0.3)} ${y(0.3)}, ${x(0.16)} ${y(0.36)}
			 C ${x(0.04)} ${y(0.42)}, ${x(-0.06)} ${y(0.4)}, ${x(-0.22)} ${y(0.34)}`,
		duration: 4.4,
		delay: 0.7,
		flip: true,
	},
	{
		d: (x, y) =>
			`M ${x(-0.22)} ${y(0.86)}
			 C ${x(0.08)} ${y(0.86)}, ${x(0.16)} ${y(0.68)}, ${x(0.3)} ${y(0.62)}
			 C ${x(0.44)} ${y(0.56)}, ${x(0.3)} ${y(0.2)}, ${x(0.24)} ${y(-0.2)}`,
		duration: 4.6,
		delay: 0.7,
	},
	{
		d: (x, y) =>
			`M ${x(0.36)} ${y(1.2)}
			 C ${x(0.4)} ${y(0.95)}, ${x(0.52)} ${y(0.74)}, ${x(0.62)} ${y(0.74)}
			 a ${x(0.06)} ${y(0.09) - y(0)} 0 1 0 0 ${y(0) - y(0.18)}
			 a ${x(0.06)} ${y(0.09) - y(0)} 0 1 0 0 ${y(0.18) - y(0)}
			 C ${x(0.74)} ${y(0.74)}, ${x(0.92)} ${y(0.66)}, ${x(1.25)} ${y(0.58)}`,
		duration: 5.6,
		delay: 1.0,
	},
];

interface Flight {
	startLeg: number;
	offset: number;
	pace: number;
	rest: number;
	drift: number;
	className: string;
}

const PLANES: Flight[] = [
	{
		startLeg: 0,
		offset: 0,
		pace: 1,
		rest: 1,
		drift: 0,
		className: "size-7 text-foreground/70",
	},
	{
		startLeg: 4,
		offset: 6,
		pace: 1.35,
		rest: 2.2,
		drift: -0.12,
		className: "size-5 text-foreground/35",
	},
	{
		startLeg: 2,
		offset: 2.5,
		pace: 1.15,
		rest: 1.6,
		drift: 0.08,
		className: "size-6 text-foreground/50",
	},
	{
		startLeg: 6,
		offset: 4,
		pace: 1.5,
		rest: 2.6,
		drift: -0.06,
		className: "size-4 text-foreground/25",
	},
];

const Plane = ({
	flight,
	width,
	height,
}: {
	flight: Flight;
	width: number;
	height: number;
}) => {
	const [index, setIndex] = useState(flight.startLeg);
	const opened = useRef(false);

	const leg = LEGS[index];
	const d = leg.d(
		(n) => n * width,
		(n) => (n + flight.drift) * height,
	);

	return (
		<motion.div
			key={index}
			className="absolute top-0 left-0"
			style={{ offsetPath: `path("${flatten(d)}")`, offsetRotate: "auto" }}
			initial={{ offsetDistance: "0%" }}
			animate={{ offsetDistance: "100%" }}
			transition={{
				duration: leg.duration * flight.pace,
				delay: leg.delay * flight.rest + (opened.current ? 0 : flight.offset),
				ease: "linear",
			}}
			onAnimationComplete={() => {
				opened.current = true;
				setIndex((current) => (current + 1) % LEGS.length);
			}}
		>
			<PaperPlanePixel
				wind
				className={cn(flight.className, leg.flip && "-scale-y-100")}
				style={{ filter: "var(--phosphor)" }}
			/>
		</motion.div>
	);
};

export const FlyingPlane = ({ className }: { className?: string }) => {
	const [ref, { width, height }] = useMeasure();
	const reduced = useReducedMotion();

	const measured = width > 0 && height > 0;

	return (
		<div
			ref={ref}
			aria-hidden="true"
			className={cn(
				"pointer-events-none absolute inset-0 overflow-hidden",
				className,
			)}
		>
			{measured &&
				!reduced &&
				PLANES.map((flight) => (
					<Plane
						key={`${flight.startLeg}-${flight.offset}`}
						flight={flight}
						width={width}
						height={height}
					/>
				))}
		</div>
	);
};
