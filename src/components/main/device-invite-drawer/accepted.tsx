import { useTranslation } from "react-i18next";
import { Drawer } from "vaul";
import { Spinner } from "@/components/ui/spinner";

export const AcceptedSection = () => {
	const { t } = useTranslation("peers");

	return (
		<div className="mt-4 space-y-4">
			<div className="flex flex-col">
				<Drawer.Title className="font-bold text-lg">
					{t("device_pairing_accepted_title")}
				</Drawer.Title>
				<Drawer.Description className="text-muted text-sm">
					{t("device_pairing_accepted_description")}
				</Drawer.Description>
			</div>
			<div className="flex justify-center">
				<Spinner className="h-6 w-6" />
			</div>
		</div>
	);
};
