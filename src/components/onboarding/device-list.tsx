import {
	AnimatePresence,
	MotionConfig,
	motion,
	type Transition,
} from "motion/react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { DeviceRow, type DeviceRowProps } from "./device-row";

interface DeviceListProps {
	label: string;
	devices: DeviceRowProps[];
	empty?: ReactNode;
	action?: ReactNode;
	className?: string;
}

const listTransition: Transition = {
	type: "spring",
	duration: 0.3,
	bounce: 0,
};

export const DeviceList = ({
	label,
	devices,
	empty,
	action,
	className,
}: DeviceListProps) => {
	if (devices.length === 0 && !empty) return null;

	return (
		<MotionConfig transition={listTransition}>
			<div className={cn("flex min-h-0 flex-col gap-2", className)}>
				<div className="flex h-5 items-center justify-between">
					<span className="font-mono text-muted/80 text-xs uppercase">
						{label}
					</span>
					{action}
				</div>
				<motion.ul
					layout
					style={{ borderRadius: 12 }}
					className="no-scrollbar relative max-h-[113px] divide-y divide-border/60 overflow-y-auto border border-border bg-background-popup/40"
				>
					<AnimatePresence initial={false} mode="popLayout">
						{devices.map((device) => (
							<motion.li
								key={device.endpointId}
								layout="position"
								initial={{ opacity: 0 }}
								animate={{ opacity: 1 }}
								exit={{ opacity: 0 }}
							>
								<DeviceRow {...device} />
							</motion.li>
						))}
						{devices.length === 0 && (
							<motion.li
								key="empty"
								layout="position"
								initial={{ opacity: 0 }}
								animate={{ opacity: 1 }}
								exit={{ opacity: 0 }}
							>
								{empty}
							</motion.li>
						)}
					</AnimatePresence>
				</motion.ul>
			</div>
		</MotionConfig>
	);
};
