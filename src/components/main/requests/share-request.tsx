import { invoke } from "@tauri-apps/api/core";
import { motion, type Variants } from "motion/react";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { toastError } from "@/lib/errors";
import { cn, humanReadableSize } from "@/lib/utils";
import type { ShareRequest as ShareRequestType } from "@/type";
import { DicebearAvatar } from "../../dicebear-avatar";
import { Button } from "../../ui/button";

type ShareRequestProps = {
	request?: ShareRequestType | null;
	index?: number;
	verticalActions?: boolean;
	onAnswerRequest?: (accepted: boolean) => void;
};

const contentVariants: Variants = {
	initial: { opacity: 0, filter: "blur(4px)" },
	animate: (index: number) => ({
		opacity: index === 0 ? 1 : 0,
		filter: index === 0 ? "blur(0px)" : "blur(4px)",
	}),
	exit: { opacity: 0, filter: "blur(4px)" },
};

export const ShareRequest = ({
	request,
	verticalActions = true,
	index = 0,
	onAnswerRequest,
}: ShareRequestProps) => {
	const { t } = useTranslation(["common", "share", "peers"]);

	const acceptRequest = async () => {
		if (!request) return;
		if (onAnswerRequest) onAnswerRequest(true);
		try {
			await invoke("answer_share_request", {
				requestId: request.requestId,
				accepted: true,
			});
			await invoke("download", {
				ticket: request.info.ticket,
				peer: request.peer,
			});
		} catch (e) {
			toastError(e, "errors:error_accepting_request");
		}
	};

	const rejectRequest = async () => {
		if (!request) return;
		if (onAnswerRequest) onAnswerRequest(false);
		try {
			await invoke("answer_share_request", {
				requestId: request.requestId,
				accepted: false,
			});
		} catch (e) {
			console.error("[requests] reject failed", e);
		}
	};

	const { size, files, name } = useMemo(() => {
		const size = humanReadableSize(request?.info.size || 0);
		const files = request?.info.totalFiles || 0;
		const name = request?.peer.name
			? request.peer.name
			: t("peer_default_name", {
					id: request?.peer.endpointId.slice(-4),
					ns: "peers",
				});

		return { size, files, name };
	}, [request]);

	return (
		<div className="edge-highlight w-full overflow-hidden rounded-lg bg-background-popup/40 backdrop-blur-3xl">
			<motion.div
				key={`src-${request?.requestId}`}
				custom={index}
				variants={contentVariants}
				initial="initial"
				animate="animate"
				exit="exit"
				className="bg-transparent p-2"
			>
				<header className="mt-2">
					<DicebearAvatar
						seed={request?.peer.endpointId || "sumendpoint"}
						className="h-8 w-8"
					/>
					<h2 className="mt-1 font-medium text-foreground">
						{t("incoming_request_title", { ns: "share" })}
					</h2>
					<p className="mt-2 text-muted text-sm leading-6">
						{t("incoming_request_description", {
							peer: name,
							count: files,
							size,
							ns: "share",
						})}
					</p>
				</header>
				<div
					className={cn(
						"mt-4 flex w-full flex-nowrap gap-x-2 text-sm",
						verticalActions && "flex-col flex-wrap gap-x-0 gap-y-2",
					)}
				>
					<Button
						variant="secondary"
						onClick={rejectRequest}
						className="flex-1 rounded-lg font-medium"
					>
						{t("reject")}
					</Button>
					<Button
						onClick={acceptRequest}
						className="flex-1 rounded-lg bg-[#3E97E6] font-medium text-[#EDFAFF] hover:bg-[#0082DB]"
					>
						{t("accept")}
					</Button>
				</div>
			</motion.div>
		</div>
	);
};
