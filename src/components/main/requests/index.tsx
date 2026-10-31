import {
	AnimatePresence,
	MotionConfig,
	motion,
	type Transition,
	type Variants,
} from "motion/react";
import { type ReactNode, useMemo, useRef } from "react";
import { useShareRequestStore, useShareRequests } from "@/lib/store/requests";
import { DeviceRequest } from "./device-request";
import { ShareRequest } from "./share-request";

type AnimatedRequestWrapperProps = {
	id: string;
	index: number;
	prevLength?: number;
	children: ReactNode;
};

type CustomVariantData = {
	index: number;
	prevLength: number;
};

const baseTransition: Transition = {
	duration: 0.285,
	ease: [0.25, 0.46, 0.45, 0.95],
	type: "spring",
	bounce: 0,
};

const variants: Variants = {
	initial: ({ prevLength, index }: CustomVariantData) => {
		if (prevLength > 3)
			return {
				transform: `scale(${1 - (index + 1) * 0.07}) translateY(${(index + 1) * -16}px)`,
			};
		return { transform: "translateY(100%)" };
	},
	animate: ({ index }: CustomVariantData) => ({
		transform: `scale(${1 - index * 0.07}) translateY(${index * -16}px)`,
	}),
	exit: { transform: "translateY(100%)" },
};

const AnimatedRequestWrapper = ({
	id,
	index,
	prevLength = 0,
	children,
}: AnimatedRequestWrapperProps) => (
	<motion.div
		key={`srw-${id}`}
		custom={{ index, prevLength }}
		variants={variants}
		initial="initial"
		animate="animate"
		exit="exit"
		className="absolute inset-x-0 bottom-0 pl-1"
		style={{ zIndex: index * -1 }}
	>
		{children}
	</motion.div>
);

export const Requests = () => {
	const shareRequests = useShareRequests();
	const popRequest = useShareRequestStore((s) => s.popRequest);
	const prevLengthRef = useRef(0);

	const prevLength = useMemo(() => {
		const len = prevLengthRef.current;

		prevLengthRef.current = shareRequests.length;

		return len;
	}, [shareRequests]);

	const visibleRequests = useMemo(() => {
		return shareRequests.slice(0, 3);
	}, [shareRequests]);

	return (
		<div className="absolute bottom-16 h-64 w-[calc(100%-4px)] overflow-hidden pl-1">
			<MotionConfig transition={baseTransition}>
				<AnimatePresence mode="popLayout">
					{visibleRequests.map((request, index) => {
						const id = `${request.type}-${
							request.type === "share" ? request.requestId : request.sessionId
						}`;
						return (
							<AnimatedRequestWrapper
								key={`req-top-key-${id}`}
								id={id}
								prevLength={prevLength}
								index={index}
							>
								{request.type === "share" ? (
									<ShareRequest
										request={request}
										index={index}
										onAnswerRequest={popRequest}
									/>
								) : (
									<DeviceRequest
										request={request}
										index={index}
										onAnswerRequest={popRequest}
									/>
								)}
							</AnimatedRequestWrapper>
						);
					})}
				</AnimatePresence>
			</MotionConfig>
		</div>
	);
};
