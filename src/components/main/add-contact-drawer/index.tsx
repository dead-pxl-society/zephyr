import { invoke } from "@tauri-apps/api/core";
import { useSetAtom } from "jotai";
import {
	type ForwardedRef,
	forwardRef,
	useImperativeHandle,
	useRef,
	useState,
} from "react";
import { useTranslation } from "react-i18next";
import { addContactDrawerAtom } from "@/lib/store/jotai";
import type { Peer } from "@/type";
import { DynamicDrawer, type DynamicDrawerHandles } from "../dynamic-drawer";
import { ContactSection, type ContactStatus } from "./contact";
import { AddContactGuide } from "./guide";

type Status = "guide" | "contact";

const FAILURE_REASONS = [
	"peer_connection_timeout",
	"already_in_contacts",
	"invalid_ticket",
	"self_contact",
] as const;

type FailureReason = (typeof FAILURE_REASONS)[number] | "generic_add_contact";

const failureReasonFrom = (exception: unknown): FailureReason => {
	const code = (exception as { code?: string })?.code;
	return (
		FAILURE_REASONS.find((reason) => reason === code) ?? "generic_add_contact"
	);
};

interface AddContactDrawerProps {
	fullscreen?: boolean;
}

export const AddContactDrawer = forwardRef(
	(
		{ fullscreen }: AddContactDrawerProps,
		ref: ForwardedRef<DynamicDrawerHandles>,
	) => {
		const [status, setStatus] = useState<Status>("guide");
		const [contactStatus, setContactStatus] = useState<ContactStatus>("none");
		const [failureReason, setFailureReason] = useState<FailureReason>(
			"generic_add_contact",
		);
		const [addedPeer, setAddedPeer] = useState<Peer | null>(null);
		const [currentEndpointId, setCurrentEndpointId] = useState<string | null>(
			null,
		);
		const drawerRef = useRef<DynamicDrawerHandles>(null);

		const setAddContactDrawerData = useSetAtom(addContactDrawerAtom);

		const { t } = useTranslation();

		const clear = () => {
			setTimeout(() => {
				setStatus("guide");
				setContactStatus("none");
				setFailureReason("generic_add_contact");
				setCurrentEndpointId(null);
				setAddedPeer(null);
				setAddContactDrawerData({ visible: false });
			}, 1000);
		};

		const present = () => drawerRef.current?.present();
		const dismiss = () => {
			drawerRef.current?.dismiss();
			clear();
		};

		const handleOpenChange = (open: boolean) => {
			if (open) return;

			clear();
		};

		const addContactByTicket = async (ticket: string) => {
			try {
				const peer = await invoke<Peer>("add_contact_by_ticket_cmd", {
					ticket,
				});
				setAddedPeer(peer);
				setContactStatus("success");
			} catch (exception) {
				setFailureReason(failureReasonFrom(exception));
				setContactStatus("failed");
			}
		};

		const onTicketSubmit = (ticket: string, endpointId: string) => {
			setContactStatus("connecting");
			setCurrentEndpointId(endpointId);
			setStatus("contact");

			addContactByTicket(ticket);
		};

		const renderContent = () => {
			if (status === "guide")
				return <AddContactGuide onSubmit={onTicketSubmit} />;
			return (
				<ContactSection
					endpointId={currentEndpointId}
					status={contactStatus}
					failureReason={t(`errors:${failureReason}`)}
					peer={addedPeer}
					onDone={dismiss}
				/>
			);
		};

		useImperativeHandle(ref, () => ({ present, dismiss }));

		return (
			<DynamicDrawer
				ref={drawerRef}
				viewKey={status}
				fullscreen={fullscreen}
				onOpenChange={handleOpenChange}
			>
				{renderContent()}
			</DynamicDrawer>
		);
	},
);
