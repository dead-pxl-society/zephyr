import { useCallback, useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { usePrevious } from "./use-previous";

let exitSettingsPath = "/";

export function useExitSettings() {
	const navigate = useNavigate();
	const { pathname } = useLocation();
	const prevPathname = usePrevious(pathname);

	useEffect(() => {
		if (
			pathname.startsWith("/settings") &&
			!prevPathname?.startsWith("/settings")
		)
			exitSettingsPath = prevPathname || "/";
	}, [pathname, prevPathname]);

	const exitSettings = useCallback(() => {
		navigate(exitSettingsPath);
	}, [navigate]);

	return exitSettings;
}
