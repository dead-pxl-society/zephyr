import type { CSSProperties } from "react";
import useAvatar from "@/lib/hooks/use-avatar";
import { cn } from "@/lib/utils";
import { CheckIcon } from "./check-icon";

type DoneBadgeProps = {
	/** Avatar seed; the badge is a blurred, swirling copy of that avatar. */
	seed: string;
	/** Hex avatar color (`#rrggbb`); falls back to the Zephyr blue. */
	color?: string | null;
	/** Whether the smoke swirls. When false it holds its current frame. */
	animated: boolean;
};

// Matches `--zephyr` in index.css. A literal hex is needed because the badge
// derives the check's contrast color from it.
const ZEPHYR = "#3e97e6";

// Picks the check color by perceived brightness so it reads on both the pale
// and the saturated avatar colors.
const inkFor = (hex: string) => {
	const n = Number.parseInt(hex.slice(1, 7), 16);
	const luma =
		(0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) /
		255;
	return luma > 0.62 ? "#161616" : "#ffffff";
};

// WebKit lets transformed children escape `overflow: hidden` + border-radius
// clipping; a mask on the clipping element forces the round clip.
const roundClip: CSSProperties = {
	maskImage: "radial-gradient(white, black)",
	WebkitMaskImage: "radial-gradient(white, black)",
};

/**
 * Check badge shown over a peer avatar once a share is done: the avatar
 * itself, blurred into smoke and slowly turning, with a counter-rotating
 * swirl of its color on top and a soft glow around it.
 */
export const DoneBadge = ({ seed, color, animated }: DoneBadgeProps) => {
	const { uri } = useAvatar(seed);
	const c = color || ZEPHYR;
	const paused = !animated && "[animation-play-state:paused]";

	return (
		<div
			className="relative h-14 w-14 rounded-full"
			style={{ boxShadow: `0 0 18px -2px ${c}99, 0 0 0 1px ${c}55` }}
		>
			<div
				className="absolute inset-0 overflow-hidden rounded-full"
				style={{ ...roundClip, backgroundColor: c }}
			>
				{uri && (
					<img
						src={uri}
						alt=""
						className={cn(
							"absolute -inset-3 h-[calc(100%+1.5rem)] w-[calc(100%+1.5rem)] max-w-none animate-[spin_9s_linear_infinite] blur-[6px]",
							paused,
						)}
					/>
				)}
				<div
					className={cn(
						"absolute -inset-1/4 animate-[spin_5s_linear_infinite_reverse] opacity-70 mix-blend-screen blur-md",
						paused,
					)}
					style={{
						backgroundImage: `conic-gradient(from 0deg, ${c} 0%, transparent 22%, color-mix(in oklab, ${c} 45%, white) 42%, transparent 64%, ${c} 82%, transparent 100%)`,
					}}
				/>
				<div
					className="absolute inset-0"
					style={{
						background: `radial-gradient(circle at 32% 28%, rgba(255,255,255,0.35), transparent 45%), ${c}33`,
					}}
				/>
			</div>
			<div className="relative flex h-full w-full items-center justify-center">
				<CheckIcon strokeColor={inkFor(c)} />
			</div>
		</div>
	);
};
