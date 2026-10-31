import { zodResolver } from "@hookform/resolvers/zod";
import { invoke } from "@tauri-apps/api/core";
import { Controller, useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { Drawer } from "vaul";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Field, FieldError } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ContactTicket } from "./contact-ticket";

const ticketSchema = (t: (key: string) => string) =>
	z.object({
		ticket: z
			.string()
			.min(1, t("errors:ticket_required"))
			.refine(
				(value) => value.startsWith("endpoint"),
				t("errors:contact_ticket_invalid"),
			),
	});

type TicketFormValues = z.infer<ReturnType<typeof ticketSchema>>;

interface AddContactGuideProps {
	onSubmit?: (ticket: string, endpointId: string) => void;
}

export const AddContactGuide = ({ onSubmit }: AddContactGuideProps) => {
	const { t } = useTranslation(["peers", "errors"]);

	const form = useForm<TicketFormValues>({
		resolver: zodResolver(ticketSchema(t)),
		defaultValues: { ticket: "" },
	});

	const handleSubmit = async ({ ticket }: TicketFormValues) => {
		try {
			const endpointId = await invoke<string>("endpoint_id_from_ticket", {
				ticket,
			});
			onSubmit?.(ticket, endpointId);
		} catch {
			form.setError("ticket", { message: t("errors:invalid_ticket") });
		}
	};

	return (
		<div className="mt-4 space-y-6">
			<div>
				<Drawer.Title className="mb-0 font-bold text-xl">
					{t("peers:add_contact_title")}
				</Drawer.Title>
			</div>
			<div className="space-y-2">
				<p className="text-muted text-sm">{t("peers:add_contact_intro")}</p>
				<ContactTicket />
				<p className="text-muted text-sm">
					{t("peers:add_contact_ticket_hint")}
				</p>
			</div>
			<form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-2">
				<Label htmlFor="contact-ticket">{t("peers:contact_ticket")}</Label>
				<Controller
					name="ticket"
					control={form.control}
					render={({ field, fieldState }) => (
						<Field data-invalid={fieldState.invalid}>
							<Input
								{...field}
								id="contact-ticket"
								placeholder={t("peers:contact_ticket_placeholder")}
								className="rounded-lg border-none bg-background/60! focus:bg-background!"
								aria-invalid={fieldState.invalid}
								autoComplete="off"
							/>
							{fieldState.invalid && <FieldError errors={[fieldState.error]} />}
						</Field>
					)}
				/>
				<Button
					type="submit"
					disabled={form.formState.isSubmitting}
					className="w-full rounded-full bg-background hover:bg-background/60 active:scale-[0.97]"
					variant="secondary"
				>
					{t("peers:action_add_contact")}
				</Button>
			</form>
		</div>
	);
};
