import { useCallback, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { useUpdaterStore } from "@/lib/store/updater";

const INITIAL_DELAY_MS = 8_000;
const POLL_INTERVAL_MS = 6 * 60 * 60 * 1000;

export const useUpdater = ({ enabled = true }: { enabled?: boolean } = {}) => {
	const { t } = useTranslation("updater");
	const check = useUpdaterStore((s) => s.check);

	const checkNow = useCallback(
		async (manual = true) => {
			const available = await check();

			if (!available && manual) {
				const { status, error } = useUpdaterStore.getState();
				if (status === "error") {
					toast.error(t("check_failed"), { description: error ?? undefined });
				} else {
					toast.success(t("up_to_date"));
				}
			}

			return available;
		},
		[check, t],
	);

	useEffect(() => {
		if (!enabled) return;

		if (import.meta.env.DEV) return;

		let interval: ReturnType<typeof setInterval> | undefined;

		const timeout = setTimeout(() => {
			checkNow(false);
			interval = setInterval(() => checkNow(false), POLL_INTERVAL_MS);
		}, INITIAL_DELAY_MS);

		return () => {
			clearTimeout(timeout);
			if (interval) clearInterval(interval);
		};
	}, [checkNow, enabled]);

	return { checkNow };
};
