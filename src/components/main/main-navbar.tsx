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
				{!pathname.startsWith("/settings") && (
					<NavbarGroup layoutId="nav-group-0" glare className="z-10">
						<NavbarAction
							iconName="arrow-down-tray"
							tooltip={t("share:action_receive_files")}
							layoutId="receive-files-action"
							onClick={displayReceiveDialog}
						/>
						<div className="h-5 w-px bg-border" />
						<NavbarAction
							layoutId="send-files-action"
							iconName="send"
							tooltip={t("share:action_share_files")}
							onClick={displayShareDialog}
						/>
					</NavbarGroup>
				)}
				{pathname === "/peers" && (
					<NavbarGroup layoutId="nav-group-1" glare>
						<NavbarAction
							layoutId="add-contact-action"
							iconName="user-plus"
							tooltip={t("peers:action_add_contact")}
							onClick={displayAddContactDrawer}
						/>
					</NavbarGroup>
				)}
				{pathname.startsWith("/settings") && (
					<NavbarGroup layoutId="nav-group-0" glare>
						<NavbarAction
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
