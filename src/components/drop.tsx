import { motion } from "motion/react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { randomZephUrls } from "@/lib/zephs";
import { LucideIcon, type LucideIconName } from "./lucide-icon";
import { WarpOverlay } from "./warp-overlay";

type BurstZephDef = {
	rotation: number;
	size: number;
	floatY: number;
	floatDuration: number;
};

type BurstZeph = BurstZephDef & {
	url: string;
	x: number;
	y: number;
	delay: number;
};

const ICON_INTERVAL = 600;

const BURST_POOL: Array<BurstZephDef> = [
	{ rotation: -15, size: 32, floatY: 8, floatDuration: 3.2 },
	{ rotation: 12, size: 36, floatY: 6, floatDuration: 2.8 },
	{ rotation: -20, size: 30, floatY: 10, floatDuration: 3.6 },
	{ rotation: 15, size: 34, floatY: 7, floatDuration: 3.0 },
	{ rotation: 10, size: 28, floatY: 9, floatDuration: 3.4 },
	{ rotation: -8, size: 32, floatY: 5, floatDuration: 2.6 },
	{ rotation: -12, size: 30, floatY: 7, floatDuration: 3.1 },
	{ rotation: 18, size: 28, floatY: 6, floatDuration: 2.9 },
	{ rotation: -22, size: 30, floatY: 9, floatDuration: 3.5 },
];

const LEFT_SLOTS = [
	{ x: -140, y: -75 },
	{ x: -185, y: 5 },
	{ x: -150, y: 80 },
];

const RIGHT_SLOTS = [
	{ x: 130, y: -70 },
	{ x: 145, y: 10 },
	{ x: 120, y: 85 },
];

function pickBurstZephs(): Array<BurstZeph> {
	const shuffled = [...BURST_POOL].sort(() => Math.random() - 0.5);
	const picked = shuffled.slice(0, 6);

	const urls = randomZephUrls(picked.length);
	return picked.map((zeph, i) => {
		const isLeft = i < 3;
		const slot = isLeft ? LEFT_SLOTS[i] : RIGHT_SLOTS[i - 3];
		return {
			...zeph,
			url: urls[i % urls.length],
			x: slot.x,
			y: slot.y,
			delay: i * 0.03,
		};
	});
}

type DropOverlayProps = {
	visible: boolean;
	className?: string;
};

export const DropOverlay = ({ visible, className }: DropOverlayProps) => (
	<WarpOverlay visible={visible} className={className}>
		<DropContent />
	</WarpOverlay>
);

const DropContent = () => {
	const [burstZephs] = useState(() => pickBurstZephs());
	const [iconName, setIconName] = useState<LucideIconName>("hand-grab");

	const { t } = useTranslation("share");

	useEffect(() => {
		const id = setInterval(() => {
			setIconName((prev) => (prev === "hand" ? "hand-grab" : "hand"));
		}, ICON_INTERVAL);

		return () => clearInterval(id);
	}, []);

	return (
		<div className="relative flex flex-col items-center gap-y-4">
			{burstZephs.map((zeph, i) => (
				<motion.div
					key={`burst-zeph-${i}`}
					className="pointer-events-none absolute top-1/2 left-1/2"
					initial={{
						transform: `translateX(0px) translateY(${-zeph.size / 2}px) scale(0.5) rotate(0deg)`,
						opacity: 0,
					}}
					animate={{
						transform: `translateX(${zeph.x}px) translateY(${zeph.y}px) scale(1) rotate(${zeph.rotation}deg)`,
						opacity: 0.9,
					}}
					transition={{
						type: "spring",
						stiffness: 280,
						damping: 22,
						delay: 0.08 + zeph.delay,
					}}
				>
					<motion.div
						animate={{
							transform: [
								"translateY(0px)",
								`translateY(${-zeph.floatY}px)`,
								"translateY(0px)",
							],
						}}
						transition={{
							duration: zeph.floatDuration,
							repeat: Infinity,
							ease: "easeInOut",
							delay: zeph.delay + 0.4,
						}}
					>
						<img
							src={zeph.url}
							alt=""
							draggable={false}
							width={zeph.size}
							height={zeph.size}
						/>
					</motion.div>
				</motion.div>
			))}
			<div
				className="relative z-10 flex rotate-180 items-center justify-center"
				style={{ height: 48, width: 48 }}
			>
				<LucideIcon key={iconName} name={iconName} />
			</div>
			<div className="relative z-10 w-full">
				<p className="text-center text-lg">{t("drop_files_title")}</p>
				<p className="text-center text-foreground/70">
					{t("drop_files_description")}
				</p>
			</div>
		</div>
	);
};
