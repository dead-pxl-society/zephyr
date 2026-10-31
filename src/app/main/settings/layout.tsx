import { motion, type Variants } from "motion/react";
import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { Outlet, useLocation, useNavigate } from "react-router-dom";
import { Drop } from "@/components/drop";
import {
	Sidebar,
	SidebarDivider,
	SidebarItem,
	SidebarUserItem,
} from "@/components/settings/sidebar";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useExitSettings } from "@/lib/hooks/use-exit-settings";
import { useUser } from "@/lib/store/user";
import { cn } from "@/lib/utils";

const contentVariants: Variants = {
	initial: { opacity: 0, filter: "blur(4px)" },
	animate: {
		opacity: 1,
		filter: "blur(0px)",
		transition: { delay: 0.12, duration: 0.2, ease: [0.25, 0.46, 0.45, 0.94] },
	},
	exit: { opacity: 0, filter: "blur(4px)" },
};

export const SettingsLayout = ({ dragging }: { dragging: boolean }) => {
	const user = useUser();
	const { t } = useTranslation("navigation");

	const { pathname } = useLocation();
	const navigate = useNavigate();
	const exitSettings = useExitSettings();

	useEffect(() => {
		const handleKeyDown = (e: KeyboardEvent) => {
			if (e.key === "Escape") {
				exitSettings();
			}
		};

		document.addEventListener("keydown", handleKeyDown);
		return () => document.removeEventListener("keydown", handleKeyDown);
	}, [exitSettings]);

	return (
		<main className="absolute inset-0 macos-glass:bg-background/70 p-2 shadow-lg macos-glass:backdrop-blur-xl">
			<div
				data-tauri-drag-region
				className="absolute top-0 right-0 left-0 z-10 h-2"
			/>
			<motion.div
				layoutId="main-app-content"
				className="h-full w-full self-end rounded-lg bg-background-surface/95 backdrop-blur-lg"
				style={{ width: "100%" }}
				transition={{ duration: 0.24, ease: [0.455, 0.03, 0.515, 0.955] }}
			>
				<motion.div
					variants={contentVariants}
					initial="initial"
					animate="animate"
					exit="exit"
					className="flex h-full w-full flex-row"
				>
					<div className={cn("h-full", dragging && "opacity-20")}>
						<Sidebar>
							<SidebarUserItem
								user={user}
								onClick={() => navigate("/settings")}
							/>
							<SidebarDivider />
							<SidebarItem
								active={pathname === "/settings"}
								icon={{ name: "user" }}
								onClick={() => navigate("/settings")}
							>
								{t("general")}
							</SidebarItem>
							<SidebarItem
								active={pathname.startsWith("/settings/peers")}
								icon={{ name: "computer-desktop", iconStyle: "micro" }}
								onClick={() => navigate("/settings/peers")}
							>
								{t("devices")}
							</SidebarItem>
							<SidebarItem
								active={pathname === "/settings/storage"}
								icon={{ name: "circle-stack" }}
								onClick={() => navigate("/settings/storage")}
							>
								{t("storage")}
							</SidebarItem>
							<SidebarItem
								active={pathname === "/settings/shortcuts"}
								lucideIcon={{ name: "command" }}
								onClick={() => navigate("/settings/shortcuts")}
							>
								{t("shortcuts")}
							</SidebarItem>
							<SidebarItem
								active={pathname === "/settings/notifications"}
								icon={{ name: "bell" }}
								onClick={() => navigate("/settings/notifications")}
							>
								{t("notifications")}
							</SidebarItem>
							<SidebarDivider />
							<SidebarItem
								active={pathname === "/settings/support"}
								lucideIcon={{ name: "headset" }}
								onClick={() => navigate("/settings/support")}
							>
								{t("support")}
							</SidebarItem>
						</Sidebar>
					</div>
					{dragging ? (
						<div className="h-full w-full rounded-r-lg border-2 border-blue-500/60">
							<Drop />
						</div>
					) : (
						<ScrollArea className="h-full w-[calc(100%-224px)] self-end rounded-lg pt-16">
							<Outlet />
						</ScrollArea>
					)}
				</motion.div>
			</motion.div>
		</main>
	);
};
