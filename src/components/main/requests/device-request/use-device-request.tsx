import { invoke } from "@tauri-apps/api/core";
import { useRef, useState } from "react";
import { toastError } from "@/lib/errors";
import type { DeviceRequest } from "@/type";

type Status = "join" | "code";

type DeviceRequestParams = {
	request?: DeviceRequest | null;
	onAnswerRequest?: (accepted: boolean) => void;
};

export const useDeviceRequest = ({
	request,
	onAnswerRequest,
}: DeviceRequestParams) => {
	const [status, setStatus] = useState<Status>("join");
	const didAnswer = useRef(false);

	const answerRequest = async (accepted: boolean) => {
		if (!request) return;
		onAnswerRequest?.(accepted);
		try {
			await invoke("answer_device_invite", {
				sessionId: request.sessionId,
				accepted,
			});
		} catch (e) {
			if (accepted) toastError(e, "errors:error_pairing_device");
			else console.error("[pairing] reject failed", e);
		}
	};

	const cleanup = () => {
		setStatus("join");
		didAnswer.current = false;
	};

	const join = () => setStatus("code");

	const reject = async () => {
		didAnswer.current = true;
		await answerRequest(false);
	};
	const accept = async () => {
		didAnswer.current = true;
		await answerRequest(true);
	};

	return { status, join, reject, accept, cleanup };
};
