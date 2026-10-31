import { useTranslation } from "react-i18next";
import { Drawer } from "vaul";
import { HeroIcon } from "@/components/hero-icon";

export const SuccessSection = () => {
	const { t } = useTranslation("peers");

	return (
		<div className="mt-4 space-y-4">
			<div className="flex flex-col">
				<Drawer.Title className="font-bold text-lg">
					{t("device_pairing_success_title")}
				</Drawer.Title>
				<Drawer.Description className="text-muted text-sm">
					{t("device_pairing_success_description")}
				</Drawer.Description>
			</div>
			<div className="flex justify-center">
				<HeroIcon
					name="check-circle"
					iconStyle="solid"
					className="h-8 w-8 text-green-400"
				/>
			</div>
		</div>
	);
};
