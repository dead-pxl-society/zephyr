import { useTranslation } from "react-i18next";
import { Drawer } from "vaul";
import { HeroIcon } from "@/components/hero-icon";
import type { PairingRejectReason } from "@/type";

const REASON_KEYS: Record<PairingRejectReason, string> = {
	declined: "device_pairing_error_declined",
	busy: "device_pairing_error_busy",
	code_mismatch: "device_pairing_error_code_mismatch",
	already_in_family: "device_pairing_error_already_in_family",
	timeout: "device_pairing_error_timeout",
};

type ErrorSectionProps = {
	reason?: PairingRejectReason | null;
};

export const ErrorSection = ({ reason }: ErrorSectionProps) => {
	const { t } = useTranslation("peers");

	return (
		<div className="mt-4 space-y-4">
			<div className="flex flex-col">
				<Drawer.Title className="font-bold text-lg">
					{t("device_pairing_error_title")}
				</Drawer.Title>
				<Drawer.Description className="text-muted text-sm">
					{t(reason ? REASON_KEYS[reason] : "device_pairing_error_generic")}
				</Drawer.Description>
			</div>
			<div className="flex justify-center">
				<HeroIcon
					name="x-circle"
					iconStyle="solid"
					className="h-8 w-8 text-red-400"
				/>
			</div>
		</div>
	);
};
