import { QueryClientProvider } from "@tanstack/react-query";
import { listen } from "@tauri-apps/api/event";
import React from "react";
import ReactDOM from "react-dom/client";
import { ErrorBoundary } from "@/components/error-boundary";
import { changeLanguage, initI18n } from "@/lib/i18n";
import { setPlatformAttribute } from "@/lib/platform-attribute";
import { queryClient } from "@/lib/store/react-query";
import { App } from "./app";

initI18n();
setPlatformAttribute();

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
	<React.StrictMode>
		<ErrorBoundary>
			<QueryClientProvider client={queryClient}>
				<App />
			</QueryClientProvider>
		</ErrorBoundary>
	</React.StrictMode>,
);

listen<string>("ui:change_language", (event) => {
	const lang = event.payload;
	changeLanguage(lang);
});
