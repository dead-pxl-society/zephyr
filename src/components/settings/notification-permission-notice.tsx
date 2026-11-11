import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import type { NotificationPermission } from "@/lib/notify";
import { openNotificationSettings } from "@/lib/notify";

type NotificationPermissionNoticeProps = {
	permission: NotificationPermission | null;
	onRequest: () => void;
};

/** Explains why the notifications switch is disabled, and how to fix it. */
export const NotificationPermissionNotice = ({
	permission,
	onRequest,
}: NotificationPermissionNoticeProps) => {
	const { t } = useTranslation("notifications");

	if (permission !== "notDetermined" && permission !== "denied") return null;

	const asked = permission === "denied";

	return (
		<div className="mt-3 flex items-center justify-between gap-3 rounded-lg bg-background px-3 py-2">
			<p className="text-muted text-sm">
				{asked ? t("permission_denied") : t("permission_not_determined")}
			</p>
			<Button
				size="sm"
				variant="secondary"
				className="shrink-0"
				onClick={() => (asked ? openNotificationSettings() : onRequest())}
			>
				{asked
					? t("open_system_settings_action")
					: t("allow_notifications_action")}
			</Button>
		</div>
	);
};
