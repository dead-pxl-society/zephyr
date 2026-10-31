import { useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import * as THREE from "three";
import { fragmentShader, vertexShader } from "./shaders";

export interface HolographicCRTMaterialProps {
	baseColor?: [number, number, number];
	scanlineIntensity?: number;
	scanlineCount?: number;
	chromaticStrength?: number;
	glitchIntensity?: number;
	bloomStrength?: number;
	flickerSpeed?: number;
	opacity?: number;
}

const defaults: Required<HolographicCRTMaterialProps> = {
	baseColor: [0.1, 0.7, 0.8],
	scanlineIntensity: 0.6,
	scanlineCount: 80.0,
	chromaticStrength: 0.15,
	glitchIntensity: 0.5,
	bloomStrength: 0.8,
	flickerSpeed: 8.0,
	opacity: 0.85,
};

export function HolographicCRTMaterial(props: HolographicCRTMaterialProps) {
	// biome-ignore lint/style/noNonNullAssertion: ref is assigned by R3F
	const matRef = useRef<THREE.ShaderMaterial>(null!);

	const uniforms = useMemo(
		() => ({
			uTime: { value: 0 },
			uBaseColor: {
				value: new THREE.Vector3(...(props.baseColor ?? defaults.baseColor)),
			},
			uScanlineIntensity: {
				value: props.scanlineIntensity ?? defaults.scanlineIntensity,
			},
			uScanlineCount: {
				value: props.scanlineCount ?? defaults.scanlineCount,
			},
			uChromaticStrength: {
				value: props.chromaticStrength ?? defaults.chromaticStrength,
			},
			uGlitchIntensity: {
				value: props.glitchIntensity ?? defaults.glitchIntensity,
			},
			uBloomStrength: {
				value: props.bloomStrength ?? defaults.bloomStrength,
			},
			uFlickerSpeed: {
				value: props.flickerSpeed ?? defaults.flickerSpeed,
			},
			uOpacity: { value: props.opacity ?? defaults.opacity },
		}),
		// eslint-disable-next-line react-hooks/exhaustive-deps
		[],
	);

	useFrame(({ clock }) => {
		if (!matRef.current) return;
		const u = matRef.current.uniforms;
		u.uTime.value = clock.getElapsedTime();

		// Live-update uniforms so props changes are reflected
		u.uBaseColor.value.set(...(props.baseColor ?? defaults.baseColor));
		u.uScanlineIntensity.value =
			props.scanlineIntensity ?? defaults.scanlineIntensity;
		u.uScanlineCount.value = props.scanlineCount ?? defaults.scanlineCount;
		u.uChromaticStrength.value =
			props.chromaticStrength ?? defaults.chromaticStrength;
		u.uGlitchIntensity.value =
			props.glitchIntensity ?? defaults.glitchIntensity;
		u.uBloomStrength.value = props.bloomStrength ?? defaults.bloomStrength;
		u.uFlickerSpeed.value = props.flickerSpeed ?? defaults.flickerSpeed;
		u.uOpacity.value = props.opacity ?? defaults.opacity;
	});

	return (
		<shaderMaterial
			ref={matRef}
			vertexShader={vertexShader}
			fragmentShader={fragmentShader}
			uniforms={uniforms}
			transparent
			side={THREE.DoubleSide}
			depthWrite={false}
			blending={THREE.AdditiveBlending}
		/>
	);
}
