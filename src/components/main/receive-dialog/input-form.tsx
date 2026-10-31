import { zodResolver } from "@hookform/resolvers/zod";
import { readText } from "@tauri-apps/plugin-clipboard-manager";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useRef } from "react";
import { Controller, useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { z } from "zod";
import { HeroIcon } from "@/components/hero-icon";
import { Button } from "@/components/ui/button";
import { DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Field, FieldError } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";

const isValidTicket = (value: string) =>
	value.startsWith("endpoint") || value.startsWith("blob");

const ticketSchema = (t: (key: string) => string) =>
	z.object({
		ticket: z
			.string()
			.min(1, t("errors:ticket_required"))
			.refine(isValidTicket, t("errors:ticket_invalid")),
	});

type TicketFormValues = z.infer<ReturnType<typeof ticketSchema>>;

export type InputFormState = "idle" | "processing" | "error";

interface InputFormProps {
	initialInput?: string;
	state?: InputFormState;
	open?: boolean;
	onSubmit?: (ticket: string) => void;
}

export const InputForm = ({
	initialInput,
	state = "idle",
	open = false,
	onSubmit,
}: InputFormProps) => {
	const { t } = useTranslation(["common", "share", "errors"]);
	const autoSubmitAttempted = useRef(false);

	const form = useForm<TicketFormValues>({
		resolver: zodResolver(ticketSchema(t)),
		defaultValues: {
			ticket: "",
		},
	});

	const handleSubmit = (data: TicketFormValues) => {
		onSubmit?.(data.ticket);
	};

	const renderStatusText = () => {
		switch (state) {
			case "idle":
				return t("common:receive");
			case "processing":
				return t("common:processing");
			case "error":
				return t("errors:error_receiving");
		}
	};

	useEffect(() => {
		if (!open) return;
		if (autoSubmitAttempted.current) return;
		autoSubmitAttempted.current = true;

		const tryAutoSubmit = async () => {
			if (initialInput && isValidTicket(initialInput)) {
				form.setValue("ticket", initialInput);
				form.handleSubmit(handleSubmit)();
				return;
			}

			try {
				const clipboardText = await readText();
				if (clipboardText && isValidTicket(clipboardText)) {
					form.setValue("ticket", clipboardText);
					form.handleSubmit(handleSubmit)();
				}
			} catch {
				// Clipboard access failed, just show the form
			}
		};

		tryAutoSubmit();
	}, [open]);

	return (
		<div className="flex flex-col gap-4">
			<div className="space-y-1">
				<DialogTitle className="line-clamp-1">
					{t("share:receive_dialog_title")}
				</DialogTitle>
				<DialogDescription className="line-clamp-2">
					{t("share:receive_dialog_description")}
				</DialogDescription>
			</div>
			<form
				onSubmit={form.handleSubmit(handleSubmit)}
				className="flex flex-col gap-4"
			>
				<Controller
					name="ticket"
					control={form.control}
					render={({ field, fieldState }) => (
						<Field data-invalid={fieldState.invalid}>
							<Input
								{...field}
								id="ticket-input"
								className="bg-white/60 focus:bg-white/70 dark:border-none dark:bg-background dark:focus:bg-background"
								aria-invalid={fieldState.invalid}
								placeholder={t("common:ticket")}
								autoComplete="off"
								autoFocus
							/>
							{fieldState.invalid && <FieldError errors={[fieldState.error]} />}
						</Field>
					)}
				/>
				<Button
					type="submit"
					className="rounded-full active:scale-[0.96]"
					variant="secondary"
					disabled={state !== "idle"}
				>
					<AnimatePresence mode="popLayout">
						{(state === "processing" || state === "error") && (
							<motion.div
								layout="position"
								initial={{ opacity: 0, scale: 0.75, filter: "blur(4px)" }}
								animate={{ opacity: 1, scale: 1, filter: "blur(0px)" }}
								exit={{ opacity: 0, scale: 0.75, filter: "blur(4px)" }}
								transition={{ duration: 0.19, ease: "easeOut" }}
								key={`status-${state}-icon`}
							>
								{state === "processing" && <Spinner />}
								{state === "error" && (
									<HeroIcon name="x-circle" iconStyle="mini" />
								)}
							</motion.div>
						)}
						<motion.p
							initial={{ opacity: 0 }}
							animate={{ opacity: 1 }}
							exit={{ opacity: 0 }}
							transition={{ duration: 0.19, ease: "easeOut" }}
							key={`status-${state}-text`}
						>
							{renderStatusText()}
						</motion.p>
					</AnimatePresence>
				</Button>
			</form>
		</div>
	);
};
