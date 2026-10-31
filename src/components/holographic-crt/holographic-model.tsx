import { useGLTF } from "@react-three/drei";
import { Canvas, useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { useWindowActive } from "@/lib/hooks/use-window-active";
import { fragmentShader, vertexShader } from "./shaders";

export type HolographicGeometry =
	| "bell"
	| "earth"
	| "parcel"
	| "peer"
	| "transfer";

type ModelConfig = {
	path: string;
	baseColor: [number, number, number];
	scale: number;
	/** Rotation used while the model spins on its own */
	rotation: [number, number, number];
	/** Rotation that points the model at the camera when it's static */
	facingRotation: [number, number, number];
	/** Edge glow strength — keep it low on models with dense silhouettes */
	bloomStrength: number;
	/**
	 * Shift applied to the mesh inside the group, in model-local units, for
	 * models whose origin isn't their center. Scales with the group.
	 */
	offset?: [number, number, number];
	/**
	 * Which faces to render. Defaults to THREE.DoubleSide; models with dense
	 * geometry use THREE.FrontSide so back faces don't blow out the additive
	 * blend.
	 */
	side?: THREE.Side;
};

export const modelConfig: Record<HolographicGeometry, ModelConfig> = {
	bell: {
		path: "/models/bell.glb",
		baseColor: [0.855, 0.647, 0.125],
		scale: 1.8,
		rotation: [-0.2, 0, 0],
		facingRotation: [-0.2, 0, 0],
		bloomStrength: 0.5,
		// The bell stands on the origin rather than around it — pull it down by
		// half its height so it spins around its own middle
		offset: [0, -0.366, 0],
	},
	earth: {
		path: "/models/earth.glb",
		baseColor: [0.553, 0.753, 0.945],
		scale: 0.3,
		// Tilt on X so the spin axis leans toward the camera
		rotation: [0.25, 0, 0],
		facingRotation: [0.25, 0, 0],
		bloomStrength: 0.45,
	},
	parcel: {
		path: "/models/parcel.glb",
		baseColor: [0.659, 0.459, 0.0],
		scale: 5,
		rotation: [0.5, 0, 0],
		facingRotation: [0.5, 0, 0],
		bloomStrength: 0.85,
		side: THREE.FrontSide,
	},
	peer: {
		path: "/models/crt-monitor.glb",
		baseColor: [0.157, 0.675, 0.396],
		scale: 1.5,
		rotation: [-0.15, 3.25, 0],
		facingRotation: [0, Math.PI, 0],
		bloomStrength: 0.1,
	},
	transfer: {
		path: "/models/paperplane.glb",
		baseColor: [0.137, 0.541, 0.875],
		scale: 15.0,
		rotation: [0, 0.75, 0.35],
		facingRotation: [0, 0.75, 0.35],
		bloomStrength: 0.85,
	},
};

/** Target ~30fps — halves GPU work while still looking smooth */
const FRAME_INTERVAL = 1 / 30;

export type HolographicModelProps = {
	geometry?: HolographicGeometry;
	/** Spin the model on its Y axis. When false it stays put, facing the camera. */
	spin?: boolean;
	/** Spin rate in radians per second. Negative spins the other way. */
	spinSpeed?: number;
	/** Override the model's rotation entirely */
	rotation?: [number, number, number];
	/** Override the model's scale */
	scale?: number;
	/** Override the geometry's default hologram color, as linear RGB in 0–1 */
	baseColor?: [number, number, number];
	/** Which faces of the geometry to render. Defaults to the geometry's own setting. */
	side?: THREE.Side;
};

export function HolographicModel({
	geometry = "parcel",
	spin = true,
	spinSpeed = 0.5,
	rotation,
	scale,
	baseColor,
	side,
}: HolographicModelProps) {
	// biome-ignore lint/style/noNonNullAssertion: ref is assigned by R3F
	const groupRef = useRef<THREE.Group>(null!);
	const elapsed = useRef(0);
	const config = modelConfig[geometry];
	const { scene } = useGLTF(config.path);

	const clonedScene = useMemo(() => scene.clone(true), [scene]);

	// Spread into scalars so an inline array prop doesn't rebuild the material
	const [colorR, colorG, colorB] = baseColor ?? config.baseColor;

	const material = useMemo(
		() =>
			new THREE.ShaderMaterial({
				vertexShader,
				fragmentShader,
				uniforms: {
					uTime: { value: 0 },
					uBaseColor: { value: new THREE.Vector3(colorR, colorG, colorB) },
					uScanlineIntensity: { value: 0.5 },
					uScanlineCount: { value: 80.0 },
					uChromaticStrength: { value: 0.15 },
					uGlitchIntensity: { value: 0.3 },
					uBloomStrength: { value: config.bloomStrength },
					uFlickerSpeed: { value: 8.0 },
					uOpacity: { value: 1 },
				},
				transparent: true,
				side: side ?? config.side ?? THREE.DoubleSide,
				depthWrite: false,
				blending: THREE.AdditiveBlending,
			}),
		[colorR, colorG, colorB, config.bloomStrength, config.side, side],
	);

	// Apply the holographic material to every mesh in the model
	useEffect(() => {
		clonedScene.traverse((child) => {
			if ((child as THREE.Mesh).isMesh) {
				(child as THREE.Mesh).material = material;
			}
		});
	}, [clonedScene, material]);

	// Throttled animation loop — the shader still needs uTime when static
	useFrame((state, delta) => {
		if (!groupRef.current) return;

		elapsed.current += delta;
		if (elapsed.current < FRAME_INTERVAL) return;
		elapsed.current = elapsed.current % FRAME_INTERVAL;

		material.uniforms.uTime.value = state.clock.getElapsedTime();
		if (spin) groupRef.current.rotation.y += FRAME_INTERVAL * spinSpeed;
	});

	return (
		<group
			ref={groupRef}
			scale={scale ?? config.scale}
			rotation={rotation ?? (spin ? config.rotation : config.facingRotation)}
		>
			<primitive object={clonedScene} position={config.offset} />
		</group>
	);
}

export type HolographicModelCanvasProps = HolographicModelProps & {
	className?: string;
	/** Camera position, defaults to the empty-state framing */
	cameraPosition?: [number, number, number];
	fov?: number;
	children?: React.ReactNode;
};

/**
 * Canvas wrapper around {@link HolographicModel}. Fills its parent, so give the
 * container a size. Pauses rendering while the window is inactive.
 */
export function HolographicModelCanvas({
	className,
	cameraPosition = [0, 0, 4],
	fov = 85,
	children,
	...modelProps
}: HolographicModelCanvasProps) {
	const active = useWindowActive();

	return (
		<Canvas
			className={className}
			frameloop={active ? "always" : "never"}
			gl={{ alpha: true, antialias: false, powerPreference: "low-power" }}
			dpr={[1, 1.5]}
			camera={{ position: cameraPosition, fov }}
		>
			<HolographicModel {...modelProps} />
			{children}
		</Canvas>
	);
}

// Preload all models so they're ready before the component mounts
useGLTF.preload("/models/bell.glb");
useGLTF.preload("/models/earth.glb");
useGLTF.preload("/models/keyboard.glb");
useGLTF.preload("/models/keyboard-retro.glb");
useGLTF.preload("/models/parcel.glb");
useGLTF.preload("/models/crt-monitor.glb");
useGLTF.preload("/models/paperplane.glb");
