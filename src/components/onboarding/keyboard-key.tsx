import { motion } from "motion/react";
import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/lib/utils";

const BASE_SIZE = 110;

const EASE = "cubic-bezier(0.23, 1, 0.32, 1)";
const EASE_RELEASE = "cubic-bezier(0.34, 1.4, 0.64, 1)";

const SHADOW_UP = [
	"0 1.5px 0.5px 2.5px rgba(0, 0, 0, 0.4)",
	"0 0 0.5px 1px #000",
	"inset 0 2px 1px 1px rgba(0, 0, 0, 0.25)",
	"inset 0 1px 1px 1px rgba(255, 255, 255, 0.2)",
].join(", ");

const SHADOW_DOWN = [
	"0 0.5px 0.5px 1px rgba(0, 0, 0, 0.45)",
	"0 0 0.5px 1px #000",
	"inset 0 2px 4px 2px rgba(0, 0, 0, 0.5)",
	"inset 0 1px 1px 1px rgba(255, 255, 255, 0.1)",
].join(", ");

const BG_UP = "radial-gradient(75% 75% at 50% 91.9%, #121212 0%, #0d0d0d 100%)";
const BG_DOWN =
	"radial-gradient(75% 75% at 50% 91.9%, #1f1f1f 0%, #151515 100%)";

const BG_SUCCESS =
	"radial-gradient(75% 75% at 50% 91.9%, #17402c 0%, #0e2a1d 100%)";

const BG_FLASH =
	"radial-gradient(75% 75% at 50% 91.9%, #3ddc84 0%, rgba(61, 220, 132, 0) 100%)";

const COLOR_UP = "#d8d8d8";
const COLOR_DOWN = "#f0f0f0";
const COLOR_SUCCESS = "#7dedae";

type KeycapVariant = "default" | "success";

const KEY_FONT = '"SF Pro Text", "SF Pro Icons", Inter, system-ui, sans-serif';

type KeyboardKeyProps = Omit<ComponentProps<"div">, "children"> & {
	label?: ReactNode;
	glyph?: ReactNode;
	pressed?: boolean;
	variant?: KeycapVariant;
	delay?: number;
	size?: number;
};

export const KeyboardKey = ({
	label,
	glyph,
	pressed = false,
	variant = "default",
	delay = 0,
	size = BASE_SIZE,
	className,
	style,
	...props
}: KeyboardKeyProps) => {
	const scale = (value: number) =>
		`${Number(((value * size) / BASE_SIZE).toFixed(2))}px`;

	const transition = [
		`box-shadow 0.2s ${EASE} ${delay}ms`,
		`transform 0.26s ${pressed ? EASE : EASE_RELEASE} ${delay}ms`,
		`color 0.14s ${EASE} ${delay}ms`,
	].join(", ");

	return (
		<div
			className={cn(
				"relative isolate grid select-none",
				label ? "grid-rows-2" : "place-content-center",
				className,
			)}
			style={{
				width: scale(BASE_SIZE),
				height: scale(BASE_SIZE),
				padding: `${scale(14.5)} ${scale(15)}`,
				borderRadius: scale(11),
				fontFamily: KEY_FONT,
				fontSize: scale(23.75),
				fontWeight: 500,
				color:
					variant === "success"
						? COLOR_SUCCESS
						: pressed
							? COLOR_DOWN
							: COLOR_UP,
				textShadow: "0 0.5px 0.5px rgba(0, 0, 0, 0.1)",
				background: BG_UP,
				boxShadow: pressed ? SHADOW_DOWN : SHADOW_UP,
				transform: pressed
					? `translateY(${scale(1.5)}) scale(0.985)`
					: undefined,
				transition,
				WebkitFontSmoothing: "antialiased",
				...style,
			}}
			{...props}
		>
			<div
				aria-hidden
				className="pointer-events-none absolute inset-0 -z-10 rounded-[inherit]"
				style={{
					background: BG_DOWN,
					opacity: pressed ? 1 : 0,
					transition: `opacity 0.4s ${EASE} ${delay}ms`,
				}}
			/>
			<div
				aria-hidden
				className="pointer-events-none absolute inset-0 -z-10 rounded-[inherit]"
				style={{
					background: BG_SUCCESS,
					opacity: variant === "success" ? 1 : 0,
					transition: `opacity 0.16s ${EASE} ${delay}ms`,
				}}
			/>
			<motion.div
				aria-hidden
				className="pointer-events-none absolute inset-0 -z-10 rounded-[inherit]"
				style={{ background: BG_FLASH }}
				initial={false}
				animate={{ opacity: variant === "success" ? [0, 0.55, 0] : 0 }}
				transition={{
					duration: 0.55,
					delay: delay / 1000,
					times: [0, 0.18, 1],
					ease: [0.16, 1, 0.3, 1],
				}}
			/>

			<span
				className={cn("leading-none", label && "self-start justify-self-end")}
			>
				{glyph}
			</span>
			{label && (
				<span
					className="self-end justify-self-start leading-none"
					style={{ fontSize: scale(13.3), letterSpacing: "0.01em" }}
				>
					{label}
				</span>
			)}
		</div>
	);
};
