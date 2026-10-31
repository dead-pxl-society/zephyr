import { OrbitControls } from "@react-three/drei";
import { Canvas, useFrame } from "@react-three/fiber";
import { Bloom, EffectComposer, Vignette } from "@react-three/postprocessing";
import { useRef } from "react";
import type * as THREE from "three";
import {
	HolographicCRTMaterial,
	type HolographicCRTMaterialProps,
} from "./holographic-crt-material";

/** Inner mesh that auto-rotates */
function HolographicObject(props: HolographicCRTMaterialProps) {
	// biome-ignore lint/style/noNonNullAssertion: ref is assigned by R3F
	const meshRef = useRef<THREE.Mesh>(null!);

	useFrame((_, delta) => {
		if (!meshRef.current) return;
		meshRef.current.rotation.y += delta * 0.3;
		meshRef.current.rotation.x += delta * 0.1;
	});

	return (
		<mesh ref={meshRef}>
			<torusKnotGeometry args={[1, 0.35, 256, 64]} />
			<HolographicCRTMaterial {...props} />
		</mesh>
	);
}

export interface HolographicCRTSceneProps extends HolographicCRTMaterialProps {
	/** CSS class applied to the outer wrapper div */
	className?: string;
	/** CSS style applied to the outer wrapper div */
	style?: React.CSSProperties;
}

/**
 * Drop-in scene that renders a holographic CRT torus knot.
 *
 * Wrap it in a sized container — it fills 100 % of its parent.
 */
export function HolographicCRTScene({
	className,
	style,
	...materialProps
}: HolographicCRTSceneProps) {
	return (
		<div
			className={className}
			style={{ width: "100%", height: "100%", background: "#050510", ...style }}
		>
			<Canvas
				camera={{ position: [0, 0, 4], fov: 50 }}
				gl={{ alpha: false, antialias: true }}
			>
				<color attach="background" args={["#050510"]} />

				<HolographicObject {...materialProps} />

				<OrbitControls enablePan={false} enableZoom={true} />

				<EffectComposer>
					<Bloom
						luminanceThreshold={0.2}
						luminanceSmoothing={0.9}
						intensity={1.5}
						mipmapBlur
					/>
					<Vignette eskil={false} offset={0.1} darkness={0.8} />
				</EffectComposer>
			</Canvas>
		</div>
	);
}
