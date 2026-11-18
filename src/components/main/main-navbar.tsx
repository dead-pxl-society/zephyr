import { useSetAtom } from "jotai";
import type { HTMLAttributes } from "react";
import { useTranslation } from "react-i18next";
import { useExitSettings } from "@/lib/hooks/use-exit-settings";
import useNavigationHistory from "@/lib/hooks/use-navigation-history";
import {
	addContactDrawerAtom,
	receiveDialogAtom,
	shareDialogAtom,
} from "@/lib/store/jotai";
import {
	Navbar,
	NavbarAction,
	NavbarDivider,
	NavbarGroup,
	NavbarNavigation,
	NavbarSection,
} from "./navbar";

export const MainNav = ({ className }: HTMLAttributes<HTMLDivElement>) => {
	const { canGoBack, canGoForward, navigate, pathname } =
		useNavigationHistory();
	const exitSettings = useExitSettings();

	const { t } = useTranslation();

	const setShareDialogData = useSetAtom(shareDialogAtom);
	const setReceiveDialogData = useSetAtom(receiveDialogAtom);
	const setAddContactDrawerData = useSetAtom(addContactDrawerAtom);

	const navBack = () => navigate(-1);
	const navForward = () => navigate(1);

	const displayShareDialog = () => setShareDialogData({ visible: true });
	const displayReceiveDialog = () => setReceiveDialogData({ visible: true });
	const displayAddContactDrawer = () =>
		setAddContactDrawerData({ visible: true });

	return (
		<Navbar className={className}>
			<NavbarSection align="start">
				<NavbarNavigation
					canGoBack={canGoBack}
					canGoForward={canGoForward}
					navBack={navBack}
					navForward={navForward}
				/>
			</NavbarSection>
			<NavbarSection align="end">
				{/*
					The share and close groups share a key on purpose: React keeps the
					same pill mounted so its width morphs while only the actions inside
					swap. Every child of an AnimatePresence needs a unique key for its
					exit animation to run.
				*/}
				{!pathname.startsWith("/settings") && (
					<NavbarGroup
						key="nav-group-0"
						layoutId="nav-group-0"
						glare
						className="z-10"
					>
						<NavbarAction
							key="receive-files-action"
							iconName="arrow-down-tray"
							tooltip={t("share:action_receive_files")}
							layoutId="receive-files-action"
							onClick={displayReceiveDialog}
						/>
						<NavbarDivider key="share-divider" />
						<NavbarAction
							key="send-files-action"
							layoutId="send-files-action"
							iconName="send"
							tooltip={t("share:action_share_files")}
							onClick={displayShareDialog}
						/>
					</NavbarGroup>
				)}
				{pathname === "/peers" && (
					<NavbarGroup key="nav-group-1" layoutId="nav-group-1" glare>
						<NavbarAction
							key="add-contact-action"
							layoutId="add-contact-action"
							iconName="user-plus"
							tooltip={t("peers:action_add_contact")}
							onClick={displayAddContactDrawer}
						/>
					</NavbarGroup>
				)}
				{pathname.startsWith("/settings") && (
					<NavbarGroup key="nav-group-0" layoutId="nav-group-0" glare>
						<NavbarAction
							key="close-action"
							layoutId="close-action"
							iconName="close"
							tooltip={t("common:exit")}
							onClick={exitSettings}
						/>
					</NavbarGroup>
				)}
			</NavbarSection>
		</Navbar>
	);
};
