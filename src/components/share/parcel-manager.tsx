import { motion, type Variants } from "motion/react";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useMiddleEllipsis } from "@/lib/hooks/use-middle-ellipsis";
import type { Parcel } from "@/lib/store/parcels";
import { cn } from "@/lib/utils";
import { mimeFromPath, mimeToFileIcon } from "@/lib/utils/file-icon";
import { basename } from "@/lib/utils/path";
import { HeroIcon } from "../hero-icon";
import { LucideIcon } from "../lucide-icon";
import { Button } from "../ui/button";
import { dialogSurface } from "./contact-search";

type ParcelManagerProps = {
	parcel?: Parcel | null;
	onBack?: () => void;
};

type FileItemProps = {
	path: string;
	mime?: string;
};

const easeOutQuart = [0.25, 1, 0.5, 1] as const;

const container: Variants = {
	initial: { opacity: 0, transform: "translateY(12px)" },
	animate: {
		opacity: 1,
		transform: "translateY(0px)",
		transition: { duration: 0.2, ease: easeOutQuart, staggerChildren: 0.02 },
	},
	exit: {
		opacity: 0,
		transform: "translateY(-12px)",
		transition: { duration: 0.15 },
	},
};

const list: Variants = {
	animate: { transition: { staggerChildren: 0.01 } },
};

const item: Variants = {
	initial: { opacity: 0, transform: "translateY(8px)", filter: "blur(4px)" },
	animate: {
		opacity: 1,
		transform: "translateY(0px)",
		filter: "blur(0px)",
		transition: { duration: 0.2, ease: easeOutQuart },
	},
};

const FileItem = ({ path, mime }: FileItemProps) => {
	const resolvedMime = mime || mimeFromPath(path);
	const iconName = mimeToFileIcon(resolvedMime);
	const label = basename(path);

	const displayText = useMiddleEllipsis({
		text: label,
		maxWidth: 320,
		font: "400 14px Geist, ui-sans-serif, system-ui, sans-serif",
	});

	return (
		<motion.li
			variants={item}
			className="flex w-full flex-row items-center gap-2 text-start"
		>
			<span className="relative h-4 w-4 shrink-0">
				<LucideIcon
					className="h-4 w-4 opacity-80 transition-[opacity,transform] duration-[200ms] [transition-timing-function:var(--ease-out-quart)] group-hover:scale-85 group-hover:opacity-0"
					name={iconName}
				/>
			</span>
			<span className="line-clamp-1">{displayText}</span>
		</motion.li>
	);
};

export const ParcelManager = ({ parcel, onBack }: ParcelManagerProps) => {
	const { t } = useTranslation();

	const files = useMemo(() => {
		return (
			parcel?.files?.slice().sort((a, b) => {
				if (a.mime === "folder" && b.mime !== "folder") return -1;
				if (a.mime !== "folder" && b.mime === "folder") return 1;
				return 0;
			}) || []
		);
	}, [parcel?.files]);

	return (
		<motion.div
			className="space-y-4 p-4"
			variants={container}
			initial="initial"
			animate="animate"
			exit="exit"
		>
			<div className="flex items-center gap-x-2">
				<motion.div variants={item}>
					<Button
						variant="ghost"
						className={cn(
							"touch-hitbox edge-highlight h-10 w-10 rounded-full bg-background-popup/40 hover:bg-background-popup/40 active:scale-[0.97]",
							dialogSurface,
						)}
						glare
						onClick={onBack}
					>
						<HeroIcon name="chevron-left" className="h-6 w-6" />
					</Button>
				</motion.div>
				<motion.span variants={item} className="text-lg">
					{t("parcels:parcel_files_title")}
				</motion.span>
			</div>
			<motion.ul variants={list} className="space-y-2 pl-2">
				{files.map((file) => (
					<FileItem
						key={file.path}
						path={file.path}
						mime={file.mime !== "unknown" ? file.mime : undefined}
					/>
				))}
			</motion.ul>
		</motion.div>
	);
};
