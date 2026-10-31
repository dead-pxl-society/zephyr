import { invoke } from "@tauri-apps/api/core";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { DicebearAvatar } from "@/components/dicebear-avatar";
import { HeroIcon } from "@/components/hero-icon";
import { LucideIcon } from "@/components/lucide-icon";
import { Button } from "@/components/ui/button";
import { DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Spinner } from "@/components/ui/spinner";
import { errorMessage } from "@/lib/errors";
import type { Peer } from "@/type";

type ContactSectionProps = {
	ticket: string | null;
	endpointId: string | null;
	onDone?: () => void;
};

type AddContactState = "loading" | "success" | "error";

const copy: Record<AddContactState, { title: string; description: string }> = {
	loading: {
		title: "share:receiving_contact_title",
		description: "share:receiving_contact_description",
	},
	success: {
		title: "share:received_contact_title",
		description: "share:received_contact_description",
	},
	error: {
		title: "share:receiving_contact_error_title",
		description: "share:receiving_contact_error_description",
	},
};

export const ContactSection = ({
	ticket,
	endpointId,
	onDone,
}: ContactSectionProps) => {
	const { t } = useTranslation(["common", "share"]);
	const [state, setState] = useState<AddContactState>("loading");
	const [contact, setContact] = useState<Peer | null>(null);
	const [failureReason, setFailureReason] = useState<string | null>(null);
	const ranRef = useRef(false);

	const renderIndicator = () => {
		if (state === "loading") return <Spinner />;
		if (state === "error")
			return <HeroIcon name="close" className="h-4 w-4" iconStyle="micro" />;

		return <LucideIcon name="user-round-check" className="left-px h-4 w-4" />;
	};

	useEffect(() => {
		if (ranRef.current || !ticket) return;
		ranRef.current = true;

		invoke<Peer>("add_contact_by_ticket_cmd", { ticket })
			.then((peer) => {
				setContact(peer);
				setState("success");
			})
			.catch((e) => {
				console.error("[receive] add contact failed", e);
				setFailureReason(errorMessage(e, "errors:generic_add_contact"));
				setState("error");
			});
	}, [ticket]);

	return (
		<div className="flex h-full w-full flex-col items-center justify-center gap-y-4">
			<div className="relative">
				<DicebearAvatar
					seed={endpointId || "sumcontactendpointid"}
					className="h-16 w-16"
				/>
				<div className="absolute -right-1 -bottom-1 flex h-6 w-6 items-center justify-center rounded-full bg-background-popup">
					<AnimatePresence initial={false} mode="popLayout">
						<motion.div
							key={`indicator-${state}`}
							initial={{
								opacity: 0,
								transform: "scale(0.5)",
								filter: "blur(2px)",
							}}
							animate={{
								opacity: 1,
								transform: "scale(1)",
								filter: "blur(0px)",
							}}
							exit={{
								opacity: 0,
								transform: "scale(0.5)",
								filter: "blur(2px)",
							}}
							transition={{ duration: 0.1 }}
						>
							{renderIndicator()}
						</motion.div>
					</AnimatePresence>
				</div>
			</div>
			<AnimatePresence initial={false} mode="popLayout">
				<motion.div
					key={`content-${state}`}
					className="flex flex-col items-center space-y-1"
					initial={{ opacity: 0 }}
					animate={{ opacity: 1 }}
					exit={{ opacity: 0 }}
				>
					<DialogTitle className="line-clamp-1 text-center">
						{t(copy[state].title)}
					</DialogTitle>
					<DialogDescription className="line-clamp-2 w-3/4 text-center">
						{state === "error" && failureReason
							? failureReason
							: t(copy[state].description, {
									contact: contact?.name || contact?.endpointId || "",
								})}
					</DialogDescription>
				</motion.div>
			</AnimatePresence>
			<Button
				onClick={onDone}
				className="h-7 flex-grow-0 self-center rounded-full py-0 active:scale-[0.96]"
				variant="secondary"
			>
				{t("common:done")}
			</Button>
		</div>
	);
};
