import { zodResolver } from "@hookform/resolvers/zod";
import { REGEXP_ONLY_DIGITS } from "input-otp";
import { motion } from "motion/react";
import { useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { z } from "zod";
import { DicebearAvatar } from "@/components/dicebear-avatar";
import { LucideIcon } from "@/components/lucide-icon";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Field } from "../../../ui/field";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "../../../ui/input-otp";

const pairingSchema = (t: (key: string) => string, expectedCode?: string) =>
	z.object({
		code: z
			.string()
			.length(6, t("errors:pairing_code_required"))
			.refine(
				(value) => value === expectedCode,
				t("errors:pairing_code_invalid"),
			),
	});

type PairingFormValues = z.infer<ReturnType<typeof pairingSchema>>;

type DeviceRequestFormProps = {
	code?: string;
	endpointId?: string;
	onSubmit?: () => Promise<void>;
	onReject?: () => void;
};

export const DeviceRequestForm = ({
	code,
	endpointId,
	onSubmit,
	onReject,
}: DeviceRequestFormProps) => {
	const [codeError, setCodeError] = useState(false);

	const { t } = useTranslation();

	const form = useForm<PairingFormValues>({
		resolver: zodResolver(pairingSchema(t, code)),
		defaultValues: { code: "" },
	});

	const onCodeError = () => {
		if (codeError) return;
		setCodeError(true);
		setTimeout(() => setCodeError(false), 1500);
	};

	const submit = form.handleSubmit(() => onSubmit?.(), onCodeError);

	return (
		<form onSubmit={submit}>
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
					{t("peers:device_code_title")}
				</h2>
				<Controller
					name="code"
					control={form.control}
					render={({ field, fieldState }) => (
						<Field className="mt-3" data-invalid={fieldState.invalid}>
							<InputOTP
								{...field}
								maxLength={6}
								aria-invalid={fieldState.invalid}
								containerClassName="w-full"
								pushPasswordManagerStrategy="none"
								autoFocus
								pattern={REGEXP_ONLY_DIGITS}
								onComplete={submit}
							>
								<InputOTPGroup className="w-full max-w-[200px]">
									<InputOTPSlot
										index={0}
										className="aspect-square h-auto min-w-0 flex-1"
									/>
									<InputOTPSlot
										index={1}
										className="aspect-square h-auto min-w-0 flex-1"
									/>
									<InputOTPSlot
										index={2}
										className="aspect-square h-auto min-w-0 flex-1"
									/>
									<InputOTPSlot
										index={3}
										className="aspect-square h-auto min-w-0 flex-1"
									/>
									<InputOTPSlot
										index={4}
										className="aspect-square h-auto min-w-0 flex-1"
									/>
									<InputOTPSlot
										index={5}
										className="aspect-square h-auto min-w-0 flex-1"
									/>
								</InputOTPGroup>
							</InputOTP>
						</Field>
					)}
				/>
			</header>
			<div
				className={cn(
					"mt-4 flex w-full flex-nowrap gap-x-2 text-sm",
					"flex-col flex-wrap items-center gap-x-0 gap-y-2",
				)}
			>
				<motion.div layoutId="reject-button" layout="position">
					<Button
						type="button"
						variant="ghost"
						onClick={onReject}
						className="h-6 flex-1 rounded-lg p-0 font-medium text-muted text-sm hover:bg-transparent hover:text-foreground hover:underline"
					>
						{t("common:reject")}
					</Button>
				</motion.div>
				<motion.button
					layoutId="main-button"
					type="submit"
					disabled={form.formState.isSubmitting}
					animate={{ x: codeError ? [0, -6, 6, -6, 6, 0] : 0 }}
					transition={{
						x: { duration: 0.4 },
						layout: { duration: 0.15, ease: [0.26, 0.08, 0.25, 1] },
					}}
					className={cn(
						"h-9 w-full flex-1 rounded-lg py-2 font-medium text-[#EDFAFF] transition-colors disabled:opacity-70",
						codeError ? "bg-red-500" : "bg-[#3E97E6] hover:bg-[#0082DB]",
					)}
				>
					{codeError ? t("errors:invalid_code") : t("peers:device_code_submit")}
				</motion.button>
			</div>
		</form>
	);
};
