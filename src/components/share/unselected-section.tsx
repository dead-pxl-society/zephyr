import { AnimatePresence, motion, type Variants } from "motion/react";
import { useTranslation } from "react-i18next";
import { Kbd, KbdGroup } from "@/components/ui/kbd";
import { usePlatform } from "@/lib/hooks/use-platform";
import { HeroIcon } from "../hero-icon";
import { Button } from "../ui/button";

type UnselectedSectionProps = {
	avatarVariants: Variants;
	onClose?: () => void;
};

export const UnselectedSection = ({
	avatarVariants,
	onClose,
}: UnselectedSectionProps) => {
	const platform = usePlatform(true);
	const { t } = useTranslation(["common", "share"]);

	return (
		<AnimatePresence mode="popLayout" initial={false}>
			<div className="flex h-full w-full flex-col items-center gap-y-4 pt-[16vh] pb-[16vh]">
				<motion.div
					layoutId="share-avatar"
					variants={avatarVariants}
					initial="initial"
					animate="visible"
					exit="exit"
					className="z-10 flex items-center justify-center overflow-hidden bg-background-popup/80 dark:bg-[#000206]/40"
					style={{ height: 48, width: 48, borderRadius: 12 }}
				>
					<div className="flex h-full w-full items-center justify-center">
						<HeroIcon name="document" className="h-4 w-4" iconStyle="solid" />
					</div>
				</motion.div>
				<div className="relative">
					<motion.p
						className="text-center text-lg"
						variants={avatarVariants}
						initial="initial"
						animate="visible"
						exit="exit"
					>
						{t("unselected_files_title", { ns: "share" })}
					</motion.p>
					<motion.p
						className="absolute left-1/2 w-64 -translate-x-1/2 text-center text-muted"
						variants={avatarVariants}
						initial="initial"
						animate="visible"
						exit="exit"
					>
						{platform !== "linux"
							? t("drag_here_with_shortcut", { ns: "share" })
							: t("drag_here", { ns: "share" })}
						{platform !== "linux" && (
							<span>
								{" "}
								<KbdGroup>
									<Kbd>{platform === "macos" ? "⌘" : "Win"}</Kbd>
									<Kbd>{platform === "macos" ? "⌃" : "Ctrl"}</Kbd>
									<Kbd>z</Kbd>
								</KbdGroup>
							</span>
						)}
					</motion.p>
				</div>
				<Button
					onClick={onClose}
					className="btndef mt-14 h-6 rounded-full bg-background-popup/80 text-foreground text-sm hover:bg-background-popup"
					variant="default"
				>
					{t("close")}
				</Button>
			</div>
		</AnimatePresence>
	);
};
