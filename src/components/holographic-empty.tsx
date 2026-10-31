import { OrbitControls } from "@react-three/drei";
import type { ReactNode } from "react";
import {
	type HolographicGeometry,
	HolographicModelCanvas,
} from "@/components/holographic-crt";
import { cn } from "@/lib/utils";

export type { HolographicGeometry };

export type HolographicEmptyProps = {
	title: string;
	description?: string;
	geometry?: HolographicGeometry;
	action?: ReactNode;
};

export function HolographicEmpty({
	title,
	description,
	geometry,
	action,
}: HolographicEmptyProps) {
	return (
		<div className="flex h-[calc(100dvh-5rem)] w-full flex-col items-center justify-center gap-y-2 overflow-hidden">
			<div
				className={cn(
					"absolute -mt-32 h-96 w-48",
					geometry === "transfer" && "-mt-40",
				)}
			>
				<HolographicModelCanvas geometry={geometry}>
					<OrbitControls
						enablePan={false}
						enableZoom={false}
						enableRotate={true}
					/>
				</HolographicModelCanvas>
			</div>
			<p className="text-center text-lg">{title}</p>
			{description && (
				<p className="w-2/3 text-center text-muted text-sm">{description}</p>
			)}
			{action && <div className="mt-2">{action}</div>}
		</div>
	);
}
