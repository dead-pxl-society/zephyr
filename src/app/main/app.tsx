import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { platform } from "@tauri-apps/plugin-os";
import { useAtom, useAtomValue } from "jotai";
import { motion, type Variants } from "motion/react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
	Navigate,
	Outlet,
	Route,
	Routes,
	useLocation,
	useNavigate,
} from "react-router-dom";
import { Drop } from "@/components/drop";
import { AddContactDrawer } from "@/components/main/add-contact-drawer";
import type { DynamicDrawerHandles } from "@/components/main/dynamic-drawer";
import { MainNav } from "@/components/main/main-navbar";
import ParcelIcon from "@/components/main/parcel-icon";
import {
	ReceiveDialog,
	type ReceiveDialogHandle,
} from "@/components/main/receive-dialog";
import {
	ShareDialog,
	type ShareDialogHandle,
	type ShareState,
} from "@/components/main/share-dialog";
import { Sidebar, SidebarItem, SidebarTitle } from "@/components/main/sidebar";
import { CrtSplash } from "@/components/onboarding/crt-splash";
import { DeviceRequestDrawer } from "@/components/onboarding/device-request-drawer";
import { TesterSwitch } from "@/components/tester-switch";
import { ScrollArea } from "@/components/ui/scroll-area";
import { toastError } from "@/lib/errors";
import { useExitSettings } from "@/lib/hooks/use-exit-settings";
import { useUpdater } from "@/lib/hooks/use-updater";
import { useWindowDragDrop } from "@/lib/hooks/use-window-drag-drop";
import {
	addContactDrawerAtom,
	receiveDialogAtom,
	shareDialogAtom,
} from "@/lib/store/jotai";
import type { Parcel } from "@/lib/store/parcels";
import { useUser } from "@/lib/store/user";
import { cn } from "@/lib/utils";
import { OnboardingLayout } from "./onboarding/layout";
import { OnboardingStepRoute } from "./onboarding/step-route";
import { firstStepId } from "./onboarding/steps";
import { useOnboardingGate } from "./onboarding/use-onboarding";
import { ParcelPage } from "./pages/parcels";
import { PeersPage } from "./pages/peers";
import { TansfersPage } from "./pages/transfers";
import { SettingsLayout } from "./settings/layout";
import { GeneralPage } from "./settings/pages/account";
import { NotificationsPage } from "./settings/pages/notifications";
import { PeersSettingsPage } from "./settings/pages/peers";
import { BlockedPeersPage } from "./settings/pages/peers/blocked-peers";
import { ShortcutsPage } from "./settings/pages/shortcuts";
import { StoragePage } from "./settings/pages/storage";
import { SupportPage } from "./settings/pages/support";

const contentVariants: Variants = {
	initial: { opacity: 0, filter: "blur(4px)" },
	animate: {
		opacity: 1,
		filter: "blur(0px)",
		transition: { delay: 0.12, duration: 0.2, ease: [0.25, 0.46, 0.45, 0.94] },
	},
	exit: { opacity: 0, filter: "blur(4px)" },
};

export const App = () => {
	const { pathname } = useLocation();
	const navigate = useNavigate();

	const [shareDialogData, setShareDialogData] = useAtom(shareDialogAtom);

	const didSetListeners = useRef(false);
	const unlistenForNavigate = useRef<UnlistenFn>(null);
	const pathnameRef = useRef(pathname);
	pathnameRef.current = pathname;

	const shareDialogRef = useRef<ShareDialogHandle>(null);

	const exitSettings = useExitSettings();
	const { ready, onboardingPending } = useOnboardingGate();
	const [splashPhase, setSplashPhase] = useState<
		"running" | "exiting" | "done"
	>("running");

	const onboarding = pathname.startsWith("/onboarding");
	const showSplash = ready && onboardingPending && splashPhase !== "done";
	const showRoutes = ready && (!onboardingPending || splashPhase !== "running");

	const importFiles = async (files: string[]) => {
		try {
			const parcel = await invoke<Parcel>("import", { files });
			setShareDialogData({ visible: true, data: { importingParcel: parcel } });
		} catch (exception) {
			toastError(exception, "errors:import_failed");
		}
	};

	const dragging = useWindowDragDrop({ onDrop: importFiles });

	const toggleSettings = useCallback(() => {
		if (onboarding) return;

		if (pathname.startsWith("/settings")) {
			exitSettings();
		} else {
			navigate("/settings");
		}
	}, [onboarding, pathname, navigate, exitSettings]);

	const listenForNavigate = useCallback(async () => {
		unlistenForNavigate.current = await listen<string>(
			"sys_menu:navigate",
			(event) => {
				const to = event.payload;
				const current = pathnameRef.current;

				if (current.startsWith("/onboarding")) return;

				if (to === "settings" && !current.startsWith("/settings"))
					navigate("/settings");
			},
		);
	}, [navigate]);

	useUpdater({ enabled: ready && !onboardingPending });

	useEffect(() => {
		const isMac = platform() === "macos";

		const handleKeyDown = (e: KeyboardEvent) => {
			const modifier = isMac ? e.metaKey : e.ctrlKey;
			if (modifier && e.key === ",") {
				e.preventDefault();
				toggleSettings();
			}
		};

		document.addEventListener("keydown", handleKeyDown);
		return () => document.removeEventListener("keydown", handleKeyDown);
	}, [toggleSettings]);

	useEffect(() => {
		const unlisten = listen("open-settings", () => {
			if (pathname.startsWith("/onboarding")) return;

			if (!pathname.startsWith("/settings")) {
				navigate("/settings");
			}
		});

		return () => {
			unlisten.then((fn) => fn());
		};
	}, [pathname, navigate]);

	useEffect(() => {
		if (shareDialogRef.current && shareDialogData.visible) {
			let shareState: ShareState =
				shareDialogData.data?.parcel && !shareDialogData.data?.peer
					? "share"
					: "select";

			if (shareDialogData.data?.importingParcel) shareState = "import";

			shareDialogRef.current.setShareState(shareState);
			shareDialogRef.current.present();
		}
	}, [shareDialogData]);

	useEffect(() => {
		if (!didSetListeners.current) {
			didSetListeners.current = true;
			listenForNavigate();
		}

		return () => {
			if (unlistenForNavigate.current) {
				unlistenForNavigate.current();
				unlistenForNavigate.current = null;
			}
		};
	}, []);

	return (
		<>
			{!pathname.startsWith("/onboarding") && (
				<MainNav className={dragging ? "opacity-0" : undefined} />
			)}
			{showRoutes && (
				<Routes>
					<Route path="/onboarding" element={<OnboardingLayout />}>
						<Route
							index
							element={<Navigate to={`/onboarding/${firstStepId()}`} replace />}
						/>
						<Route path=":stepId" element={<OnboardingStepRoute />} />
					</Route>
					<Route path="/" element={<Layout dragging={dragging} />}>
						<Route index element={<TansfersPage />} />
						<Route path="peers" element={<PeersPage />} />
						<Route path="parcels" element={<ParcelPage />} />
					</Route>
					<Route
						path="/settings"
						element={<SettingsLayout dragging={dragging} />}
					>
						<Route index element={<GeneralPage />} />
						<Route path="/settings/peers" element={<PeersSettingsPage />} />
						<Route
							path="/settings/peers/blocked"
							element={<BlockedPeersPage />}
						/>
						<Route path="/settings/storage" element={<StoragePage />} />
						<Route path="/settings/shortcuts" element={<ShortcutsPage />} />
						<Route
							path="/settings/notifications"
							element={<NotificationsPage />}
						/>
						<Route path="/settings/support" element={<SupportPage />} />
					</Route>
				</Routes>
			)}
			<ShareDialog ref={shareDialogRef} {...(shareDialogData.data ?? {})} />
			{showSplash && (
				<CrtSplash
					onExitStart={() => setSplashPhase("exiting")}
					onDone={() => setSplashPhase("done")}
				/>
			)}
		</>
	);
};

export const Layout = ({ dragging }: { dragging: boolean }) => {
	const user = useUser();
	const location = useLocation();

	const receiveDialogData = useAtomValue(receiveDialogAtom);
	const addContactDrawerData = useAtomValue(addContactDrawerAtom);

	const receiveDialogRef = useRef<ReceiveDialogHandle>(null);
	const addContactDrawerRef = useRef<DynamicDrawerHandles>(null);

	const { t } = useTranslation(["navigation", "share", "notifications"]);
	const navigate = useNavigate();

	useEffect(() => {
		if (receiveDialogRef.current && receiveDialogData.visible) {
			receiveDialogRef.current.present();
		}
	}, [receiveDialogData]);

	useEffect(() => {
		if (addContactDrawerRef.current && addContactDrawerData.visible) {
			addContactDrawerRef.current.present();
		}
	}, [addContactDrawerData]);

	return (
		<main className="absolute inset-0 flex flex-row items-center justify-center macos-glass:bg-background-surface/70 p-2 pl-0 shadow-lg macos-glass:backdrop-blur-xl">
			<div
				data-tauri-drag-region
				className="absolute top-0 right-0 left-0 z-10 h-2"
			/>
			<motion.div
				variants={contentVariants}
				initial="initial"
				animate="animate"
				exit="exit"
				className={cn("h-full", dragging && "opacity-20!")}
			>
				<TesterSwitch>
					<Sidebar user={user}>
						<SidebarItem
							active={location.pathname === "/"}
							icon={{ name: "arrows-up-down", iconStyle: "micro" }}
							onClick={() => navigate("/")}
						>
							{t("transfers")}
						</SidebarItem>
						<SidebarItem
							active={location.pathname === "/parcels"}
							customIcon={<ParcelIcon />}
							onClick={() => navigate("/parcels")}
						>
							{t("parcels")}
						</SidebarItem>
						<SidebarItem
							active={location.pathname === "/peers"}
							icon={{ name: "computer-desktop", iconStyle: "micro" }}
							onClick={() => navigate("/peers")}
						>
							{t("devices")}
						</SidebarItem>
					</Sidebar>
					<Sidebar user={user}>
						<SidebarTitle className="px-2">Zephyr</SidebarTitle>
						<SidebarItem
							active={location.pathname === "/"}
							icon={{ name: "arrows-up-down", iconStyle: "micro" }}
							onClick={() => navigate("/")}
							className="px-4!"
						>
							{t("transfers")}
						</SidebarItem>
						<SidebarItem
							active={location.pathname === "/parcels"}
							customIcon={<ParcelIcon />}
							onClick={() => navigate("/parcels")}
							className="px-4!"
						>
							{t("parcels")}
						</SidebarItem>
						<SidebarItem
							active={location.pathname === "/peers"}
							icon={{ name: "computer-desktop", iconStyle: "micro" }}
							onClick={() => navigate("/peers")}
							className="px-4!"
						>
							{t("devices")}
						</SidebarItem>
					</Sidebar>
				</TesterSwitch>
			</motion.div>
			<motion.div
				layoutId="main-app-content"
				className={cn(
					"h-full self-end rounded-lg bg-background-surface/95 backdrop-blur-lg",
					dragging && "border-2 border-blue-500/60",
				)}
				style={{ width: "calc(100% - 224px)" }}
				transition={{ duration: 0.24, ease: [0.455, 0.03, 0.515, 0.955] }}
			>
				{dragging ? (
					<Drop />
				) : (
					<ScrollArea className="h-full w-full self-end rounded-lg">
						<motion.div
							variants={contentVariants}
							initial="initial"
							animate="animate"
							exit="exit"
						>
							<Outlet />
						</motion.div>
					</ScrollArea>
				)}
			</motion.div>
			<ReceiveDialog
				ref={receiveDialogRef}
				{...(receiveDialogData.data ?? {})}
			/>
			<DeviceRequestDrawer onlyAcceptedFromNotification />
			<AddContactDrawer ref={addContactDrawerRef} />
		</main>
	);
};
