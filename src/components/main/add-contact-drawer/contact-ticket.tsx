import { invoke } from "@tauri-apps/api/core";
import { writeText } from "@tauri-apps/plugin-clipboard-manager";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { HeroIcon } from "@/components/hero-icon";

type CopyStatus = "idle" | "success" | "error";

export const ContactTicket = () => {
	const { t } = useTranslation();
	const [ticket, setTicket] = useState("");
	const [copyStatus, setCopyStatus] = useState<CopyStatus>("idle");

	const copyEndpointTicket = async () => {
		try {
			await writeText(ticket);
			setCopyStatus("success");
		} catch {
			setCopyStatus("error");
		} finally {
			setTimeout(() => {
				setCopyStatus("idle");
			}, 1500);
		}
	};

	const renderCopyIcon = () => {
		if (copyStatus === "idle")
			return (
				<HeroIcon name="square-2-stack" className="h-4 w-4" iconStyle="mini" />
			);
		if (copyStatus === "error")
			return <HeroIcon name="close" className="h-4 w-4" iconStyle="mini" />;

		return <HeroIcon name="check" className="h-4 w-4" iconStyle="mini" />;
	};

	useEffect(() => {
		invoke<string>("endpoint_ticket")
			.then((value) => setTicket(value || ""))
			.catch(() => toast.error(t("errors:ticket_copy")));
	}, [t]);

	return (
		<button
			type="button"
			className="group mt-2 flex h-10 max-w-full items-center gap-2 rounded-full bg-background px-2 text-start disabled:opacity-60"
			onClick={copyEndpointTicket}
			disabled={!ticket}
		>
			<div className="flex-1 overflow-hidden">
				<p className="line-clamp-1 font-mono text-sm">{ticket}</p>
			</div>
			<div className="shrink-0 border-l border-l-border pl-1">
				<div className="flex h-8 w-8 items-center justify-center rounded-full group-hover:bg-border/40">
					<AnimatePresence mode="wait" initial={false}>
						<motion.span
							key={copyStatus}
							initial={{
								opacity: 0,
								transform: "scale(0.5)",
								filter: "blur(4px)",
							}}
							animate={{
								opacity: 1,
								transform: "scale(1)",
								filter: "blur(0px)",
							}}
							exit={{
								opacity: 0,
								transform: "scale(0.5)",
								filter: "blur(4px)",
							}}
							transition={{ duration: 0.1 }}
						>
							{renderCopyIcon()}
						</motion.span>
					</AnimatePresence>
				</div>
			</div>
		</button>
	);
};
