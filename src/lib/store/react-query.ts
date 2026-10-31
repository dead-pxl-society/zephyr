import { QueryClient } from "@tanstack/react-query";
import { listen } from "@tauri-apps/api/event";

export const queryClient = new QueryClient();

listen("sys_menu:deleted_transfers", () => {
	queryClient.invalidateQueries({ queryKey: ["transfers"] });
});
