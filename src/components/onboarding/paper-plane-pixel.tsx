import { motion, steps, useReducedMotion } from "motion/react";
import type { SVGProps } from "react";
import { cn } from "@/lib/utils";

const CELL = 32 / 21;

const TRAIL = [
	{ d: "M9.72748e-05 11.4297H6.1001V12.9497H9.72748e-05V11.4297Z", delay: 0 },
	{ d: "M-0.00019455 14.4795H3.0498V15.9995H-0.00019455V14.4795Z", delay: 0.6 },
];

const GUST = {
	initial: { x: 3 * CELL, opacity: 0 },
	animate: { x: [3 * CELL, 0, -5 * CELL], opacity: [0, 1, 0] },
	times: [0, 0.3, 1],
	ease: [steps(3), steps(5)],
	duration: 1.2,
};

interface PaperPlanePixelProps extends SVGProps<SVGSVGElement> {
	wind?: boolean;
}

export const PaperPlanePixel = ({
	wind = false,
	className,
	...props
}: PaperPlanePixelProps) => {
	const reduced = useReducedMotion();
	const blowing = wind && !reduced;

	return (
		<svg
			viewBox="0 0 32 32"
			fill="currentColor"
			xmlns="http://www.w3.org/2000/svg"
			aria-hidden="true"
			className={cn("size-8", className)}
			{...props}
		>
			{TRAIL.map(({ d, delay }) =>
				blowing ? (
					<motion.path
						key={d}
						d={d}
						initial={GUST.initial}
						animate={GUST.animate}
						transition={{
							duration: GUST.duration,
							times: GUST.times,
							ease: GUST.ease,
							delay,
							repeat: Number.POSITIVE_INFINITY,
						}}
					/>
				) : (
					<path key={d} d={d} />
				),
			)}
			<path d="M22.86 22.1003H15.24V23.6203H7.62V20.5703H3.05V17.5303H4.57V19.0503H30.48V17.5303H32V20.5703H22.86V22.1003Z" />
			<path d="M4.57012 16H7.62012V17.53H4.57012V16Z" />
			<path d="M6.0999 8.37988H9.1499V9.90988H6.0999V8.37988Z" />
			<path d="M7.61992 14.4795H10.6699V15.9995H7.61992V14.4795Z" />
			<path d="M13.7202 12.9497H15.2402V14.4797H10.6702V12.9497H12.1902V11.4297H13.7202V12.9497Z" />
			<path d="M12.1902 11.4299H10.6702V8.37988H15.2402V9.90988H12.1902V11.4299Z" />
			<path d="M15.24 9.91016H18.29V11.4302H15.24V9.91016Z" />
			<path d="M15.2401 14.4795H19.8101V15.9995H15.2401V14.4795Z" />
			<path d="M18.2898 11.4297H21.3398V12.9497H18.2898V11.4297Z" />
			<path d="M21.3399 12.9502H24.3799V14.4802H21.3399V12.9502Z" />
			<path d="M24.3802 14.4795H27.4302V15.9995H24.3802V14.4795Z" />
			<path d="M27.43 16H30.48V17.53H27.43V16Z" />
		</svg>
	);
};
