import type { AppLanguage } from "./lib/i18n";
import type { Parcel } from "./lib/store/parcels";

export interface ImportError {
	parcelId: number;
	error: { code: string; message: string };
}

export interface ImportProgress {
	parcelId: number;
	type:
		| "size"
		| "outboardProgress"
		| "copyDone"
		| "copyProgress"
		| "done"
		| "error";
	key: string;
	progress?: number;
	size?: number;
	error?: string;
}

export interface SendProgress {
	type: "started" | "progress" | "completed" | "aborted";
	connectionId: number;
	requestId: number;
	endpointId: string;
	size?: number;
	progress?: number;
}

export interface GetProgress {
	type: "connecting" | "started" | "progress" | "done" | "error";
	progress?: number;
	totalSize?: number;
	totalFiles?: number;
	transferId: number;
	from?: PeerInfo;
	ticket?: string;
	error?: string;
}

export interface PeerInfo {
	endpointId: string;
	name?: string;
}

export interface ShortcutConfig {
	share: string;
	receive: string;
	accept: string;
	reject: string;
}

export type Platform =
	| "windows"
	| "macos"
	| "linux"
	| "android"
	| "ios"
	| "other";

export type OnboardingStepId =
	| "welcome"
	| "share-shortcut"
	| "share-shortcut-linux"
	| "all-shortcuts"
	| "personal-devices"
	| "contacts"
	| "notifications-and-sounds"
	| "outro";

export interface Onboarding {
	/** Furthest step the user has reached, null until they start. */
	step: OnboardingStepId | null;
	completed: boolean;
}

export interface User {
	id: string;
	endpointId: string;
	name: string;
	platform: Platform;
	language: "system" | AppLanguage;
	shortcuts: ShortcutConfig;
	notifications: boolean;
	sounds: boolean;
	onboarding: Onboarding;
}

export interface Config {
	clipboardSync: boolean;
	clipboardFiles: boolean;
	clipboardMaxBytes: number;
}

export type PeerKind = "stranger" | "contact" | "device";
export type TrustLevel = "trusted" | "untrusted" | "blocked";

export interface Peer {
	id: string;
	createdAt?: string;
	updatedAt?: string;
	endpointId: string;
	ticket: string;
	name?: string;
	platform?: Platform;
	trustLevel: TrustLevel;
	kind: PeerKind;
}

export interface EphemeralPeer {
	endpointId: string;
	ticket?: string;
	peer?: Peer;
}

export interface PeerDiscovery {
	type: "discovered" | "expired" | "enriched";
	peer: EphemeralPeer;
	lastSeen?: number;
}

export interface ShareRequest {
	peer: Peer;
	requestId: number;
	info: ShareInfo;
}

export interface DevicePeerInfo {
	endpointId: string;
	name?: string;
	platform?: Platform;
}

export interface DeviceRequest {
	sessionId: number;
	peer: DevicePeerInfo;
	code: string;
}

export type PairingRejectReason =
	| "declined"
	| "busy"
	| "code_mismatch"
	| "already_in_family"
	| "timeout";

export type DevicePairingEvent =
	| { type: "code"; sessionId: number; peer: DevicePeerInfo; code: string }
	| { type: "completed"; sessionId: number; peer: DevicePeerInfo }
	| { type: "rejected"; sessionId: number; reason: PairingRejectReason }
	// failed = unexpected breakage; reason is a debug string, not for display.
	| { type: "failed"; sessionId: number; reason: string }
	| { type: "cancelled"; sessionId: number };

export interface DeviceView {
	peer: Peer;
	online: boolean;
}

export interface FamilyView {
	familyId: string;
	epoch: number;
	memberCount: number;
	devices: DeviceView[];
}

export type FamilyLeftReason = "kicked" | "left" | "dissolved";

export interface FamilyLeft {
	reason: FamilyLeftReason;
}

export interface DevicePresence {
	type: "online" | "offline";
	endpointId: string;
}

export type IncomingRequest =
	| ({ type: "share" } & ShareRequest)
	| ({
			type: "device";
			/** Accepted from a notification, so it's waiting on the code in a drawer. */
			acceptedFromNotification?: boolean;
	  } & DeviceRequest);

export interface ShareInfo {
	ticket: string;
	totalFiles: number;
	size: number;
}

// connecting: the push command is still dialing the peer.
// requested: the peer has the request and we are waiting for their answer.
// importing: files dropped directly on a peer are being imported first.
export type PeerStatus =
	| "idle"
	| "connecting"
	| "requested"
	| "rejected"
	| "cancelled"
	| "timeout"
	| "importing"
	| "transfering"
	| "done"
	| "fail";

export interface PeerActivity {
	status: PeerStatus;
	progress?: number;
}

export interface ShareResponse {
	endpointId: string;
	requestId: number;
	type: "accepted" | "rejected" | "cancelled" | "timeout" | "unknown";
}

export interface ExportEvent {
	type: "size" | "progress" | "done" | "error" | "finished";
	transferId: number;
	name: string;
	size?: number;
	progress?: number;
	error?: string;
	paths?: string[];
}

export type ShareDialogProps = {
	peer?: Peer;
	parcel?: Parcel;
	importingParcel?: Parcel;
	onClose?: () => void;
};
