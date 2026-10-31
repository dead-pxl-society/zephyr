import { invoke } from "@tauri-apps/api/core";
import { useSetAtom } from "jotai";
import { AnimatePresence, motion, type Variants } from "motion/react";
import {
	type ForwardedRef,
	forwardRef,
	useImperativeHandle,
	useState,
} from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { receiveDialogAtom } from "@/lib/store/jotai";
import { ContactSection } from "./contact";
import { InputForm, type InputFormState } from "./input-form";
import { TransferSection } from "./transfer";

export interface ReceiveDialogHandle {
	present: () => void;
	dismiss: () => void;
}

export interface ReceiveDialogProps {
	input?: string;
	onClose?: () => void;
}

type ReceiveState = "input" | "contact" | "transfer";

export const ReceiveDialog = forwardRef(
	(
		{ input: initialInput, onClose }: ReceiveDialogProps,
		ref: ForwardedRef<ReceiveDialogHandle>,
	) => {
		const [open, setOpen] = useState(false);
		const [receiveState, setReceiveState] = useState<ReceiveState>("input");
		const [receiveFormState, setReceiveFormState] =
			useState<InputFormState>("idle");
		const [currentTicket, setCurrentTicket] = useState<string | null>(null);
		const [currentEndpointId, setCurrentEndpointId] = useState<string | null>(
			null,
		);

		const setReceiveDialogData = useSetAtom(receiveDialogAtom);

		const { t } = useTranslation();

		const present = () => setOpen(true);
		const dismiss = () => {
			setOpen(false);
			if (onClose) onClose();
			clearState();
		};

		const clearState = () => {
			setTimeout(() => {
				setReceiveState("input");
				setReceiveFormState("idle");
				setReceiveDialogData({ visible: false, data: undefined });
				setCurrentTicket(null);
				setCurrentEndpointId(null);
			}, 200);
		};

		const handleOpenChange = (newOpen: boolean) => {
			setOpen(newOpen);

			if (!newOpen) {
				clearState();
				if (onClose) onClose();
			}
		};

		const handleReceiveBlob = async (ticket: string) => {
			setReceiveFormState("processing");
			try {
				await invoke("download", { ticket });
				setReceiveState("transfer");
				setReceiveFormState("idle");
			} catch (_e) {
				setReceiveFormState("error");
				setTimeout(() => {
					setReceiveFormState("idle");
				}, 2000);
				setCurrentTicket(null);
			}
		};

		const handleReceiveContact = async (ticket: string) => {
			try {
				const endpointId = await invoke<string>("endpoint_id_from_ticket", {
					ticket,
				});
				setCurrentEndpointId(endpointId);
				setReceiveState("contact");
			} catch (e) {
				console.log(JSON.stringify(e));
				toast.error(t("errors:invalid_ticket"));
			}
		};

		const handleTicketSubmit = (ticket: string) => {
			setCurrentTicket(ticket);

			if (ticket.startsWith("blob")) {
				handleReceiveBlob(ticket);
				return;
			}

			handleReceiveContact(ticket);
		};

		const renderContent = () => {
			switch (receiveState) {
				case "input":
					return (
						<InputForm
							initialInput={initialInput}
							state={receiveFormState}
							open={open}
							onSubmit={handleTicketSubmit}
						/>
					);
				case "contact":
					return (
						<ContactSection
							ticket={currentTicket}
							endpointId={currentEndpointId}
							onDone={dismiss}
						/>
					);
				case "transfer":
					return <TransferSection ticket={currentTicket} onDone={dismiss} />;
			}
		};

		useImperativeHandle(ref, () => ({ present, dismiss }));

		return (
			<Dialog open={open} onOpenChange={handleOpenChange}>
				<DialogContent
					className="top-[calc(-0.01px+8vh)] left-[calc(50%+112px)] flex w-[28rem] translate-y-0 flex-col gap-0 overflow-hidden rounded-xl border-border bg-background-top p-4"
					showCloseButton={false}
				>
					<AnimatePresence initial={false} mode="popLayout">
						<motion.div
							className="h-full w-full"
							variants={variants}
							custom={receiveState === "input" ? 0 : 1}
							initial="initial"
							animate="animate"
							exit="exit"
							key={receiveState}
							transition={{ duration: 0.175, ease: "easeInOut" }}
						>
							{renderContent()}
						</motion.div>
					</AnimatePresence>
				</DialogContent>
			</Dialog>
		);
	},
);

const variants: Variants = {
	initial: (direction: number) => ({
		opacity: 0,
		filter: "blur(4px)",
		transform: direction > 0 ? "translateX(200px)" : "translateX(-200px)",
	}),
	animate: {
		opacity: 1,
		filter: "blur(0px)",
		transform: "translateX(0)",
	},
	exit: (direction: number) => ({
		opacity: 0,
		filter: "blur(4px)",
		transform: direction > 0 ? "translateX(200px)" : "translateX(-200px)",
	}),
};
