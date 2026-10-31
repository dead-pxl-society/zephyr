import { QueryClientProvider } from "@tanstack/react-query";
import { listen } from "@tauri-apps/api/event";
import dayjs from "dayjs";
import relativeTime from "dayjs/plugin/relativeTime";
import React from "react";
import ReactDOM from "react-dom/client";
import { HashRouter } from "react-router-dom";
import { ErrorBoundary } from "@/components/error-boundary";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { changeLanguage, initI18n } from "@/lib/i18n";
import { setPlatformAttribute } from "@/lib/platform-attribute";
import { queryClient } from "@/lib/store/react-query";
import { App } from "./app";
import "@/lib/store/cuelume";

dayjs.extend(relativeTime);

initI18n();
setPlatformAttribute();

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
	<React.StrictMode>
		<ErrorBoundary>
			<QueryClientProvider client={queryClient}>
				<HashRouter>
					<TooltipProvider delayDuration={1000}>
						<App />
					</TooltipProvider>
					<Toaster />
				</HashRouter>
			</QueryClientProvider>
		</ErrorBoundary>
	</React.StrictMode>,
);

listen<string>("ui:change_language", (event) => {
	const lang = event.payload;
	changeLanguage(lang);
});
