import { motion, type Transition } from "motion/react";
import { useEffect, useState } from "react";

type PeerDoneBurstProps = {
	/** Hex color of the peer avatar; falls back to the Zephyr blue. */
	color?: string | null;
	/** Fade the glow in place and skip the moving light bars. */
	reduced?: boolean;
	/** Fired once the glow has left; the burst can be unmounted. */
	onFinished?: () => void;
};

// Bars keep rising for this long, then they fade while the glow sinks back out
// the bottom and the burst is unmounted, so the infinite loops never outlive
// the moment.
const LINGER_FOR = 4.5;

const easeOutExpo: Transition["ease"] = [0.19, 1, 0.22, 1];
const easeOutQuad: Transition["ease"] = [0.25, 0.46, 0.45, 0.94];

const rand = (min: number, max: number) => min + Math.random() * (max - min);

type Bar = {
	left: number;
	bottom: number;
	height: number;
	rise: number;
	duration: number;
	delay: number;
};

const makeBars = (
	count: number,
	duration: [number, number],
	delay: [number, number],
	height: [number, number] = [14, 40],
): Bar[] =>
	Array.from({ length: count }, () => ({
		left: rand(8, 92),
		bottom: rand(15, 45),
		height: rand(height[0], height[1]),
		rise: rand(28, 72),
		duration: rand(duration[0], duration[1]),
		delay: rand(delay[0], delay[1]),
	}));

// The opening burst is front-loaded: tallest bars fire first, at once, and the
// rest follow on a short, uneven stagger so the impact reads as one hit rather
// than a metronome.
const makeBurst = (count: number): Bar[] =>
	makeBars(count, [0.45, 0.75], [0, 0], [18, 52])
		.sort((a, b) => b.height - a.height)
		.map((bar, i) => ({
			...bar,
			rise: bar.rise * 1.3,
			delay: i < 3 ? rand(0, 0.03) : 0.03 + i * 0.025 + rand(0, 0.04),
		}));

/**
 * Celebration painted behind a peer card's content when an outbound share
 * completes: a glow in the avatar color rises from the bottom edge while thin
 * light bars shoot upward and fade, a few of them lingering for a moment.
 * Then the bars fade, the glow sinks back out the bottom and `onFinished`
 * fires.
 *
 * Must be placed in the card's background stack, before its content, so the
 * avatar and labels paint over it.
 */
export const PeerDoneBurst = ({
	color,
	reduced,
	onFinished,
}: PeerDoneBurstProps) => {
	// Positions are rolled once per burst so every card (and every share) gets
	// its own pattern; durations are random so the loops never line up.
	const [burst] = useState(() => makeBurst(11));
	const [linger] = useState(() => makeBars(5, [1.3, 2.4], [0.5, 1.4]));
	const [ending, setEnding] = useState(false);

	useEffect(() => {
		const timer = setTimeout(() => setEnding(true), LINGER_FOR * 1000);
		return () => clearTimeout(timer);
	}, []);

	const c = color || "var(--zephyr)";
	const barFill = `linear-gradient(to top, transparent, color-mix(in oklab, ${c} 55%, white), transparent)`;

	return (
		<div
			aria-hidden
			className="pointer-events-none absolute inset-0 overflow-hidden rounded-xl"
		>
			<motion.div
				className="absolute inset-0"
				style={{
					background: `radial-gradient(120% 75% at 50% 112%, color-mix(in oklab, ${c} 60%, transparent), transparent 72%)`,
				}}
				initial={{
					opacity: 0,
					transform: reduced ? "translateY(0%)" : "translateY(40%)",
				}}
				animate={
					ending
						? {
								opacity: 0,
								transform: reduced ? "translateY(0%)" : "translateY(60%)",
							}
						: {
								// Flashes past its resting brightness, then settles: the hit.
								opacity: reduced ? 0.75 : [0, 1, 0.75],
								transform: "translateY(0%)",
							}
				}
				transition={
					ending
						? { duration: reduced ? 0.4 : 0.6, ease: easeOutQuad }
						: reduced
							? { duration: 0.4, ease: easeOutExpo }
							: {
									opacity: {
										duration: 0.9,
										times: [0, 0.25, 1],
										ease: "easeOut",
									},
									transform: { duration: 0.45, ease: easeOutExpo },
								}
				}
				onAnimationComplete={() => {
					if (ending) onFinished?.();
				}}
			/>

			{!reduced &&
				burst.map((b, i) => (
					<motion.span
						// biome-ignore lint/suspicious/noArrayIndexKey: fixed, never reordered
						key={i}
						className="absolute w-px origin-bottom"
						style={{
							left: `${b.left}%`,
							bottom: `${b.bottom}%`,
							height: b.height,
							backgroundImage: barFill,
						}}
						initial={{ opacity: 0, transform: "translateY(0px) scaleY(0)" }}
						animate={{
							opacity: [0, 1, 0],
							transform: [
								"translateY(0px) scaleY(0)",
								`translateY(${-b.rise * 0.4}px) scaleY(1)`,
								`translateY(${-b.rise}px) scaleY(0.6)`,
							],
						}}
						transition={{
							delay: b.delay,
							duration: b.duration,
							times: [0, 0.3, 1],
							ease: easeOutExpo,
						}}
					/>
				))}

			{!reduced && (
				<motion.div
					className="absolute inset-0"
					initial={{ opacity: 1 }}
					animate={{ opacity: ending ? 0 : 1 }}
					transition={{ duration: 0.5 }}
				>
					{linger.map((b, i) => (
						<motion.span
							// biome-ignore lint/suspicious/noArrayIndexKey: fixed, never reordered
							key={i}
							className="absolute w-px"
							style={{
								left: `${b.left}%`,
								bottom: `${b.bottom}%`,
								height: b.height,
								backgroundImage: barFill,
							}}
							initial={{ opacity: 0, transform: "translateY(0px)" }}
							animate={{
								opacity: [0, 0.8, 0],
								transform: ["translateY(0px)", `translateY(${-b.rise}px)`],
							}}
							transition={{
								delay: b.delay,
								duration: b.duration,
								ease: easeOutQuad,
								repeat: Number.POSITIVE_INFINITY,
								repeatDelay: b.delay * 0.6,
							}}
						/>
					))}
				</motion.div>
			)}
		</div>
	);
};
