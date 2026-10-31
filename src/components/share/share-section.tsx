import { writeText } from "@tauri-apps/plugin-clipboard-manager";
import { AnimatePresence, motion, type Variants } from "motion/react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import type { Parcel } from "@/lib/store/parcels";
import { humanReadableSize } from "@/lib/utils";
import type { PeerInfo } from "@/type";
import { DicebearAvatar } from "../dicebear-avatar";
import { HeroIcon } from "../hero-icon";
import { MorphButton } from "../morph-button";
import { Button } from "../ui/button";
import { type ContentStatus, ShareContent } from "./share-content";

export type { ContentStatus };

interface ShareSectionProps {
	avatarVariants: Variants;
	parcel?: Parcel | null;
	avatarSeed?: string;
	contentStatus: ContentStatus;
	onContentStatusChange: (status: ContentStatus) => void;
	onDone?: () => void;
	onPush?: (peer: PeerInfo) => void;
	onCancel?: (endpointId: string) => void;
}

const contentVariants = {
	initial: { transform: "translateY(-4px)", filter: "blur(4px)", opacity: 0 },
	visible: {
		transform: "translateY(0px)",
		filter: "blur(0px)",
		opacity: 1,
		transition: { delay: 0.14, bounce: 0, duration: 0.16 },
	},
	exit: { transform: "translateY(-4px)", filter: "blur(4px)", opacity: 0 },
};

export const ShareSection = ({
	avatarVariants,
	parcel,
	avatarSeed,
	contentStatus,
	onContentStatusChange,
	onDone,
	onPush,
	onCancel,
}: ShareSectionProps) => {
	const [copied, setCopied] = useState(false);

	const { t } = useTranslation(["common", "share"]);

	const copyTicket = async () => {
		if (!parcel?.ticket || copied) return;
		try {
			await writeText(parcel?.ticket || "");
			setCopied(true);
			setTimeout(() => {
				setCopied(false);
			}, 1000);
		} catch (_e) {
			// ignore
		}
	};

	const onFileCountClick = () => onContentStatusChange("parcel");

	return (
		<AnimatePresence mode="popLayout">
			<div className="z-10 flex h-full w-full flex-col overflow-hidden">
				<div className="h-full w-full overflow-hidden">
					<div
						className="flex h-20 flex-row items-center justify-between"
						data-tauri-drag-region
					>
						<div className="flex items-center gap-x-2 px-4">
							<motion.div
								layoutId="share-avatar"
								variants={avatarVariants}
								initial="initial"
								animate="visible"
								exit="exit"
								className="z-10 flex items-center justify-center"
								style={{ height: 48, width: 48 }}
							>
								<DicebearAvatar
									seed={avatarSeed || "sumseedyseed"}
									className="h-full w-full"
								/>
							</motion.div>
							<div>
								<motion.p
									layout="position"
									layoutId="share-header-title"
									className="text-sm"
									variants={avatarVariants}
									initial="initial"
									animate="visible"
									exit="exit"
								>
									{t("share_title", { ns: "share" })}
								</motion.p>
								<motion.p
									layoutId="share-header-subtitle"
									className="whitespace-nowrap text-muted text-sm"
									layout="position"
									variants={avatarVariants}
									initial="initial"
									animate="visible"
									exit="exit"
								>
									{t("peers:status_sharing")}{" "}
									<button
										type="button"
										onClick={onFileCountClick}
										className="cursor-pointer align-baseline hover:underline"
									>
										{t("parcels:file_count", {
											count: parcel?.totalFiles || 1,
										})}
									</button>
									{parcel?.size && ` · ${humanReadableSize(parcel.size || 0)}`}
								</motion.p>
							</div>
						</div>
						<motion.div
							variants={contentVariants}
							initial="initial"
							animate="visible"
							exit="exit"
							className="flex flex-end items-center gap-2 pr-4"
						>
							<MorphButton
								contentKey={copied ? "cp-success" : "cp-reg"}
								onClick={copyTicket}
								variant="ghost"
								glare
								className="touch-hitbox edge-highlight h-10 w-10 rounded-full bg-background-popup/40 shadow-lg backdrop-blur-lg hover:bg-background-popup/40 active:scale-[0.96]"
							>
								<div className="flex h-8 w-8 items-center justify-center">
									<HeroIcon
										name={copied ? "check" : "square-2-stack"}
										className="h-6 w-6"
									/>
								</div>
							</MorphButton>
						</motion.div>
					</div>
					<motion.div
						variants={contentVariants}
						initial="initial"
						animate="visible"
						exit="exit"
						className="h-[0.5px] bg-border-inv/10"
					/>
					<ShareContent
						parcel={parcel}
						contentStatus={contentStatus}
						onContentStatusChange={onContentStatusChange}
						onPush={onPush}
						onCancel={onCancel}
						className="h-96"
					/>
				</div>
				<motion.div
					className="h-12"
					variants={contentVariants}
					initial="initial"
					animate="visible"
					exit="exit"
				>
					<div className="h-[0.5px] bg-border-inv/10" />
					<div className="flex h-12 w-full items-center justify-end px-4">
						<Button
							onClick={onDone}
							className="btndef h-6 rounded-full bg-background-popup/80 text-foreground text-sm hover:bg-background-popup"
							variant="default"
						>
							{t("done")}
						</Button>
					</div>
				</motion.div>
			</div>
		</AnimatePresence>
	);
};
