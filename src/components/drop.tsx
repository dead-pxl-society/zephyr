import { AnimatePresence, motion } from "motion/react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { LucideIcon, type LucideIconName } from "./lucide-icon";

type BurstIconDef = {
	name: LucideIconName;
	rotation: number;
	size: number;
	floatY: number;
	floatDuration: number;
};

type BurstIcon = BurstIconDef & {
	x: number;
	y: number;
	delay: number;
};

const ICON_INTERVAL = 600;

const ICON_POOL: Array<BurstIconDef> = [
	{ name: "file", rotation: -15, size: 22, floatY: 8, floatDuration: 3.2 },
	{ name: "file-image", rotation: 12, size: 26, floatY: 6, floatDuration: 2.8 },
	{
		name: "file-text",
		rotation: -20,
		size: 20,
		floatY: 10,
		floatDuration: 3.6,
	},
	{
		name: "folder-closed",
		rotation: 15,
		size: 24,
		floatY: 7,
		floatDuration: 3.0,
	},
	{
		name: "file-code-corner",
		rotation: 10,
		size: 18,
		floatY: 9,
		floatDuration: 3.4,
	},
	{ name: "file-key", rotation: -8, size: 22, floatY: 5, floatDuration: 2.6 },
	{
		name: "file-volume",
		rotation: -12,
		size: 20,
		floatY: 7,
		floatDuration: 3.1,
	},
	{ name: "file-cog", rotation: 18, size: 18, floatY: 6, floatDuration: 2.9 },
	{
		name: "file-digit",
		rotation: -22,
		size: 20,
		floatY: 9,
		floatDuration: 3.5,
	},
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

function pickBurstIcons(): Array<BurstIcon> {
	const shuffled = [...ICON_POOL].sort(() => Math.random() - 0.5);
	const picked = shuffled.slice(0, 6);

	return picked.map((icon, i) => {
		const isLeft = i < 3;
		const slot = isLeft ? LEFT_SLOTS[i] : RIGHT_SLOTS[i - 3];
		return {
			...icon,
			x: slot.x,
			y: slot.y,
			delay: i * 0.04,
		};
	});
}

export const Drop = () => {
	const [burstIcons] = useState(() => pickBurstIcons());
	const [iconName, setIconName] = useState<LucideIconName>("hand-grab");

	const { t } = useTranslation("share");

	useEffect(() => {
		const id = setInterval(() => {
			setIconName((prev) => (prev === "hand" ? "hand-grab" : "hand"));
		}, ICON_INTERVAL);

		return () => clearInterval(id);
	}, []);

	return (
		<div className="relative h-full w-full overflow-hidden">
			<AnimatePresence mode="popLayout" initial={true}>
				<motion.div
					initial={{ opacity: 0 }}
					animate={{ opacity: 1 }}
					className="pointer-events-none absolute inset-0"
					style={{
						background:
							"radial-gradient(ellipse at 50% 28vh, oklch(0.623 0.214 259.815 / 0.1) 0%, transparent 99%)",
					}}
				/>
				{burstIcons.map((icon) => (
					<motion.div
						key={`burst-icon-${icon.name}`}
						className="pointer-events-none absolute top-[28vh] left-1/2"
						initial={{
							transform: `translateX(0px) translateY(${-icon.size / 2}px) scale(0.5) rotate(0deg)`,
							opacity: 0,
						}}
						animate={{
							transform: `translateX(${icon.x}px) translateY(${icon.y}px) scale(1) rotate(${icon.rotation}deg)`,
							opacity: 0.6,
						}}
						transition={{
							type: "spring",
							stiffness: 180,
							damping: 18,
							delay: icon.delay,
						}}
					>
						<motion.div
							animate={{
								transform: [
									"translateY(0px)",
									`translateY(${-icon.floatY}px)`,
									"translateY(0px)",
								],
							}}
							transition={{
								duration: icon.floatDuration,
								repeat: Infinity,
								ease: "easeInOut",
								delay: icon.delay + 0.4,
							}}
						>
							<LucideIcon
								name={icon.name}
								width={icon.size}
								height={icon.size}
								strokeWidth={1.5}
								className="text-muted-foreground"
							/>
						</motion.div>
					</motion.div>
				))}
			</AnimatePresence>
			<div className="relative z-10 flex h-full w-full flex-col items-center gap-y-4 pt-[16vh] pb-[16vh]">
				<div>
					<AnimatePresence mode="popLayout" initial={false}>
						<motion.div
							className="z-10 flex rotate-180 items-center justify-center overflow-hidden"
							style={{ height: 48, width: 48, borderRadius: 12 }}
						>
							<LucideIcon key={iconName} name={iconName} />
						</motion.div>
					</AnimatePresence>
				</div>
				<div className="w-full">
					<p className="text-center text-lg">{t("drop_files_title")}</p>
					<p className="text-center text-muted">
						{t("drop_files_description")}
					</p>
				</div>
			</div>
		</div>
	);
};
