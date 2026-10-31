import {
	AnimatePresence,
	MotionConfig,
	motion,
	type Variants,
} from "motion/react";
import { useTranslation } from "react-i18next";
import useMeasure from "react-use-measure";
import type { DeviceRequest as DeviceRequestType } from "@/type";
import { DeviceRequestDecision } from "./device-request/decision";
import { DeviceRequestForm } from "./device-request/form";
import { useDeviceRequest } from "./device-request/use-device-request";

type DeviceRequestProps = {
	request?: DeviceRequestType | null;
	index?: number;
	onAnswerRequest?: (accepted: boolean) => void;
};

const contentVariants: Variants = {
	initial: { opacity: 0, filter: "blur(4px)" },
	animate: (index: number) => ({
		opacity: index === 0 ? 1 : 0,
		filter: index === 0 ? "blur(0px)" : "blur(4px)",
	}),
	exit: { opacity: 0, filter: "blur(4px)" },
};

export const DeviceRequest = ({
	request,
	index,
	onAnswerRequest,
}: DeviceRequestProps) => {
	const { t } = useTranslation(["common", "peers", "errors"]);
	const [elementRef, bounds] = useMeasure();

	const { status, join, reject, accept } = useDeviceRequest({
		request,
		onAnswerRequest,
	});

	const peerName = request?.peer.name
		? request.peer.name
		: t("peers:peer_default_name", {
				id: request?.peer.endpointId.slice(-4),
			});

	return (
		<div className="edge-highlight w-full overflow-hidden rounded-lg bg-background-popup/40 backdrop-blur-3xl">
			<motion.div
				key={`src-${request?.sessionId}`}
				custom={index}
				variants={contentVariants}
				initial="initial"
				animate={{
					opacity: index === 0 ? 1 : 0,
					filter: index === 0 ? "blur(0px)" : "blur(4px)",
					height: bounds.height,
				}}
				transition={{ height: { ease: [0.25, 1, 0.5, 1], duration: 0.27 } }}
				exit="exit"
				className="bg-transparent"
			>
				<div ref={elementRef} className="p-2">
					<MotionConfig
						transition={{
							duration: 0.15,
							ease: [0.26, 0.08, 0.25, 1],
						}}
					>
						<AnimatePresence initial={false} mode="popLayout">
							<motion.div
								key={status}
								initial={{ opacity: 0 }}
								animate={{ opacity: 1 }}
								exit={{ opacity: 0 }}
							>
								{status === "join" ? (
									<DeviceRequestDecision
										endpointId={request?.peer.endpointId}
										peerName={peerName}
										onReject={reject}
										onAccept={join}
									/>
								) : (
									<DeviceRequestForm
										code={request?.code}
										endpointId={request?.peer.endpointId}
										onSubmit={accept}
										onReject={reject}
									/>
								)}
							</motion.div>
						</AnimatePresence>
					</MotionConfig>
				</div>
			</motion.div>
		</div>
	);
};
