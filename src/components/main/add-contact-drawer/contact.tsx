import { AnimatePresence, motion } from "motion/react";
import { useTranslation } from "react-i18next";
import { Drawer } from "vaul";
import { DicebearAvatar } from "@/components/dicebear-avatar";
import { HeroIcon } from "@/components/hero-icon";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import useAvatar from "@/lib/hooks/use-avatar";
import type { Peer } from "@/type";

export type ContactStatus = "none" | "connecting" | "success" | "failed";

type ContactSectionProps = {
	endpointId: string | null;
	peer?: Peer | null;
	status: ContactStatus;
	failureReason?: string;
	onDone?: () => void;
};

export const ContactSection = ({
	endpointId,
	peer,
	status,
	failureReason,
	onDone,
}: ContactSectionProps) => {
	const { t } = useTranslation();

	const seed = endpointId || "sumrandomseed";
	const { uri } = useAvatar(seed);

	const renderStatusIcon = () => {
		if (status === "failed")
			return (
				<HeroIcon
					name="x-circle"
					className="h-4 w-4 text-red-500 text-sm dark:text-red-400"
					iconStyle="micro"
				/>
			);
		if (status === "success")
			return (
				<HeroIcon
					name="check-circle"
					className="h-4 w-4 text-green-500 text-sm dark:text-green-400"
					iconStyle="micro"
				/>
			);

		return <Spinner />;
	};

	const statusText = () => {
		if (status === "failed") return t("peers:status_failed");
		if (status === "success") return t("peers:status_done");
		return t("peers:status_connecting");
	};

	return (
		<div className="mt-4 space-y-6">
			<div>
				<Drawer.Title className="mb-0 font-bold text-xl">
					{t("peers:adding_contact")}
				</Drawer.Title>
			</div>
			<div className="flex flex-col items-center space-y-3">
				<AnimatePresence mode="popLayout" initial={false}>
					<motion.div
						key={seed}
						initial={{ opacity: 0.5, filter: "blur(4px)" }}
						animate={{ opacity: 1, filter: "blur(0px)" }}
						exit={{ opacity: 0.5, filter: "blur(4px)" }}
					>
						<div className="relative">
							<img
								src={uri || ""}
								alt=""
								aria-hidden
								className="pointer-events-none absolute inset-0 -z-10 h-14 w-14 scale-250 opacity-10 blur-lg saturate-150"
							/>
							<DicebearAvatar seed={seed} className="h-14 w-14" />
						</div>
					</motion.div>
					<motion.div
						key={status}
						className="flex items-center gap-1"
						initial={{ opacity: 0, filter: "blur(4px)" }}
						animate={{ opacity: 1, filter: "blur(0px)" }}
						exit={{ opacity: 0, filter: "blur(4px)" }}
					>
						{renderStatusIcon()}
						<span>{statusText()}</span>
					</motion.div>
				</AnimatePresence>
				{failureReason && status === "failed" && (
					<span className="text-center text-muted">{failureReason}</span>
				)}
				{peer && status === "success" && (
					<span className="text-center">
						{t("peers:added_to_contacts", { peer: peer.name })}
					</span>
				)}
			</div>
			<Button
				className="w-full rounded-full bg-background hover:bg-background/60 active:scale-[0.97]"
				variant="secondary"
				onClick={onDone}
			>
				{t("common:done")}
			</Button>
		</div>
	);
};
