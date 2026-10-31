import { useTranslation } from "react-i18next";
import { Drawer } from "vaul";
import { Button } from "@/components/ui/button";
import {
	InputOTP,
	InputOTPGroup,
	InputOTPSlot,
} from "@/components/ui/input-otp";

type ShowCodeProps = {
	code: string;
	onCancel?: () => void;
};

export const ShowCode = ({ code, onCancel }: ShowCodeProps) => {
	const { t } = useTranslation(["peers", "common"]);

	return (
		<div className="mt-4 space-y-8">
			<div className="flex flex-col">
				<Drawer.Title className="font-bold text-lg">
					{t("device_pairing_code_title")}
				</Drawer.Title>
				<Drawer.Description className="text-muted text-sm">
					{t("device_pairing_code_description")}
				</Drawer.Description>
				<div className="mt-4 flex justify-center">
					<InputOTP maxLength={6} value={code} readOnly className="pt-2">
						<InputOTPGroup className="font-bold text-lg">
							{["a", "b", "c", "d", "e", "f"].map((id, i) => (
								<InputOTPSlot key={id} index={i} />
							))}
						</InputOTPGroup>
					</InputOTP>
				</div>
			</div>
			<Button
				className="w-full rounded-full active:scale-[0.97]"
				variant="secondary"
				onClick={onCancel}
			>
				{t("common:cancel")}
			</Button>
		</div>
	);
};
