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
			 a ${x(0.07)} ${y(0.1)} 0 1 0 0 ${-y(0.2)}
			 a ${x(0.07)} ${y(0.1)} 0 1 0 0 ${y(0.2)}
			 C ${x(0.46)} ${y(0.46)}, ${x(0.58)} ${y(0.3)}, ${x(0.52)} ${y(-0.2)}`,
		duration: 9.0,
		delay: 1.2,
	},
	{
		d: (x, y) =>
			`M ${x(0.66)} ${y(-0.2)}
			 C ${x(0.66)} ${y(0.14)}, ${x(0.58)} ${y(0.3)}, ${x(0.72)} ${y(0.44)}
			 C ${x(0.84)} ${y(0.56)}, ${x(1.0)} ${y(0.52)}, ${x(1.25)} ${y(0.38)}`,
		duration: 6.2,
		delay: 1.6,
	},
	{
		d: (x, y) =>
			`M ${x(1.25)} ${y(0.56)}
			 C ${x(0.96)} ${y(0.66)}, ${x(0.8)} ${y(0.84)}, ${x(0.58)} ${y(0.78)}
			 C ${x(0.36)} ${y(0.72)}, ${x(0.0)} ${y(0.6)}, ${x(-0.22)} ${y(0.62)}`,
		duration: 8.0,
		delay: 2.0,
		flip: true,
	},
	{
		d: (x, y) =>
			`M ${x(-0.22)} ${y(0.86)}
			 C ${x(0.08)} ${y(0.86)}, ${x(0.16)} ${y(0.68)}, ${x(0.3)} ${y(0.62)}
			 C ${x(0.44)} ${y(0.56)}, ${x(0.3)} ${y(0.2)}, ${x(0.24)} ${y(-0.2)}`,
		duration: 7.2,
		delay: 1.4,
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
		startLeg: 2,
		offset: 6,
		pace: 1.35,
		rest: 2.2,
		drift: -0.12,
		className: "size-5 text-foreground/35",
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
						key={flight.startLeg}
						flight={flight}
						width={width}
						height={height}
					/>
				))}
		</div>
	);
};
