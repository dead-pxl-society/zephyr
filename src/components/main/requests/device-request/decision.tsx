import { motion } from "motion/react";
import { useTranslation } from "react-i18next";
import { DicebearAvatar } from "@/components/dicebear-avatar";
import { LucideIcon } from "@/components/lucide-icon";
import { Button } from "@/components/ui/button";

type DeviceRequestDecision = {
	endpointId?: string;
	peerName: string;
	onReject?: () => void;
	onAccept?: () => void;
};

export const DeviceRequestDecision = ({
	endpointId,
	peerName,
	onReject,
	onAccept,
}: DeviceRequestDecision) => {
	const { t } = useTranslation();
	return (
		<div>
			<header className="mt-2 flex grow-0 flex-col">
				<div className="relative flex items-center justify-center self-start">
					<DicebearAvatar
						seed={endpointId || "sumendpoint"}
						className="h-8 w-8"
					/>
					<LucideIcon
						name="monitor-smartphone"
						className="absolute h-5 w-5 text-black/70"
					/>
				</div>
				<h2 className="mt-1 font-medium text-foreground">
					{t("peers:device_request_title")}
				</h2>
				<p className="mt-2 text-muted text-sm leading-6">
					{t("peers:device_request_description", {
						peer: peerName,
					})}
				</p>
			</header>
			<div className="mt-4 flex w-full flex-nowrap gap-x-2 text-sm">
				<motion.div
					layoutId="reject-button"
					layout="position"
					className="flex-1"
				>
					<Button
						variant="secondary"
						onClick={onReject}
						className="w-full rounded-lg font-medium"
					>
						{t("common:reject")}
					</Button>
				</motion.div>
				<motion.button
					layoutId="main-button"
					onClick={onAccept}
					className="h-9 w-full flex-1 rounded-lg bg-[#3E97E6] py-2 font-medium text-[#EDFAFF] hover:bg-[#0082DB]"
				>
					{t("peers:device_request_join")}
				</motion.button>
			</div>
		</div>
	);
};
