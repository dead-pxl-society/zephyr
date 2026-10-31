import { atom } from "jotai";
import type { ReceiveDialogProps } from "@/components/main/receive-dialog";
import type { ShareDialogProps } from "@/type";

interface ShareDialogAtom {
	visible: boolean;
	data?: ShareDialogProps;
}

interface ReceiveDialogAtom {
	visible: boolean;
	data?: ReceiveDialogProps;
}

export const shareDialogAtom = atom<ShareDialogAtom>({ visible: false });

export const receiveDialogAtom = atom<ReceiveDialogAtom>({ visible: false });

export const addContactDrawerAtom = atom<{ visible: boolean }>({
	visible: false,
});
