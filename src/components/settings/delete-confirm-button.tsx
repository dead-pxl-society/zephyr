import {
	AnimatePresence,
	MotionConfig,
	motion,
	type Transition,
} from "motion/react";
import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useOnClickOutside } from "usehooks-ts";
import { HeroIcon, type HeroIconName } from "@/components/hero-icon";
import { Button } from "@/components/ui/button";

type DeleteConfirmButtonProps = {
	layoutKey: string;
	label?: string;
	confirmLabel?: string;
	icon?: HeroIconName;
	onDelete?: () => void;
};

const DELETE_TRANSITION: Transition = {
	duration: 0.18,
	ease: [0.26, 0.08, 0.25, 1],
};

// TODO: this component can be improved further with processing, success and error states.
export const DeleteConfirmButton = ({
	layoutKey,
	label,
	confirmLabel,
	icon = "trash",
	onDelete,
}: DeleteConfirmButtonProps) => {
	const { t } = useTranslation("common");
	const [expanded, setExpanded] = useState(false);
	const expandedRef = useRef(null);

	const expand = () => setExpanded(true);
	const collapse = () => setExpanded(false);

	const handleDelete = () => {
		collapse();
		if (onDelete) onDelete();
	};

	// @ts-expect-error
	useOnClickOutside(expandedRef, collapse);

	return (
		<MotionConfig transition={DELETE_TRANSITION}>
			<AnimatePresence initial={false} mode="popLayout">
				{!expanded ? (
					<motion.div
						key="collapsed"
						layoutId={`${layoutKey}-delete-btn`}
						transition={{ layout: DELETE_TRANSITION }}
						className="group rounded-full hover:bg-background-top hover:shadow-sm"
					>
						<Button
							variant="ghost"
							className="bg-transparent hover:bg-transparent"
							onClick={expand}
						>
							<HeroIcon
								name={icon}
								className="text-muted transition-colors duration-[0.2s] ease-out group-hover:text-foreground"
							/>
							<motion.span
								layout="position"
								layoutId={`${layoutKey}-delete-btn-text`}
								transition={{ layout: DELETE_TRANSITION }}
							>
								{label ?? t("delete_all")}
							</motion.span>
						</Button>
					</motion.div>
				) : (
					<motion.div
						ref={expandedRef}
						key="expanded"
						className="relative flex flex-row items-center justify-end"
					>
						<AnimatePresence propagate>
							<motion.span
								className="absolute right-0 text-muted text-xs"
								initial={{
									opacity: 0,
									transform: "translateY(0)",
									filter: "blur(4px)",
								}}
								animate={{
									opacity: 1,
									transform: "translateY(-2rem)",
									filter: "blur(0px)",
								}}
								exit={{
									opacity: 0,
									transform: "translateY(0)",
									filter: "blur(4px)",
								}}
							>
								{t("confirm_prompt")}
							</motion.span>
							<motion.div
								className="group rounded-full hover:bg-background-top"
								initial={{
									transform: "translateX(1.5rem) scale(0.8)",
									opacity: 0,
									filter: "blur(4px)",
								}}
								animate={{
									transform: "translateX(0) scale(1)",
									opacity: 1,
									filter: "blur(0px)",
								}}
								exit={{
									transform: "translateX(1.5rem) scale(0.8)",
									opacity: 0,
									filter: "blur(4px)",
								}}
							>
								<Button
									variant="ghost"
									className="bg-transparent hover:bg-transparent"
									onClick={collapse}
								>
									{t("cancel")}
								</Button>
							</motion.div>
							<motion.div
								layoutId={`${layoutKey}-delete-btn`}
								transition={{ layout: DELETE_TRANSITION }}
								className="group z-10 rounded-full bg-red-500 transition-colors hover:bg-red-500/80"
							>
								<Button
									variant="ghost"
									className="bg-transparent hover:bg-transparent"
									onClick={handleDelete}
								>
									<motion.span
										layout="position"
										layoutId={`${layoutKey}-delete-btn-text`}
										transition={{ layout: DELETE_TRANSITION }}
									>
										{confirmLabel ?? t("delete")}
									</motion.span>
								</Button>
							</motion.div>
						</AnimatePresence>
					</motion.div>
				)}
			</AnimatePresence>
		</MotionConfig>
	);
};
