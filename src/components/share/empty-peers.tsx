import { useTranslation } from "react-i18next";
import { RefreshDiscoveryButton } from "../refresh-discovery-button";

export const EmptyPeers = () => {
	const { t } = useTranslation("peers");

	return (
		<div className="mt-4 flex w-full items-center justify-center">
			<div className="flex w-2/3 flex-col items-center gap-y-1">
				<p className="text-center text-lg">{t("empty_nearby_title")}</p>
				<p className="text-center text-muted text-sm">
					{t("empty_nearby_description")}
				</p>
				<RefreshDiscoveryButton showLabel tooltip={false} className="mt-2" />
			</div>
		</div>
	);
};
