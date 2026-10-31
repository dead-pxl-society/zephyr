import { Mesh, Program, Renderer, Triangle } from "ogl";
import { memo, useEffect, useRef } from "react";
import { useWindowActive } from "@/lib/hooks/use-window-active";

export type ScanDirection = "vertical" | "horizontal" | "diagonal";

export type ScannerSettings = {
	color1: string;
	color2: string;
	color3: string;
	speed: number;
	sweepSpeed: number;
	sweepWidth: number;
	sweepFalloff: number;
	scale: number;
	frequency: number;
	ripple: number;
	bandDensity: number;
	lineSharpness: number;
	glow: number;
	scanDirection: ScanDirection;
	colorSpread: number;
	brightness: number;
	contrast: number;
	softness: number;
	vignette: number;
	scanline: boolean;
	grain: boolean;
	grainIntensity: number;
	opacity: number;
};

export interface ScannerProps extends Partial<ScannerSettings> {
	/** Frame cap. 30 halves the GPU work of a 60Hz display and looks the same
	 * on a sweep this slow — raise it if you speed the sweep up a lot. */
	fps?: number;
	/** Device pixel ratio cap. This shader is fragment-bound, so every step up
	 * costs quadratically. */
	maxDpr?: number;
	className?: string;
}

const hexCache = new Map<string, [number, number, number]>();

const hexToRgb = (hex: string): [number, number, number] => {
	const cached = hexCache.get(hex);
	if (cached) return cached;

	const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
	const rgb: [number, number, number] = result
		? [
				parseInt(result[1], 16) / 255,
				parseInt(result[2], 16) / 255,
				parseInt(result[3], 16) / 255,
			]
		: [1, 1, 1];

	hexCache.set(hex, rgb);
	return rgb;
};

/** Sweep axis as a direction vector, so the shader can `dot()` instead of branch */
const AXIS: Record<ScanDirection, [number, number]> = {
	vertical: [0, 1],
	horizontal: [1, 0],
	diagonal: [Math.SQRT1_2, Math.SQRT1_2],
};

const vertex = `#version 300 es
in vec2 position;
void main() {
  gl_Position = vec4(position, 0.0, 1.0);
}
`;

const fragment = `#version 300 es
precision highp float;

uniform vec2 iResolution;
uniform float iTime;
uniform vec2 uAxis;
uniform float uSpeed;
uniform float uSweepSpeed;
uniform float uInvSweepWidth;
uniform float uSweepFalloff;
uniform float uInvScale;
uniform float uFreqScale;
uniform float uRipple;
uniform float uBandDensity;
uniform float uLineSharpness;
uniform float uGlow;
uniform float uSplit;
uniform float uBrightness;
uniform float uContrast;
uniform float uSoftness;
uniform float uVignette;
uniform float uOpacity;
uniform float uScanline;
uniform float uGrain;
uniform vec3 uColor1;
uniform vec3 uColor2;
uniform vec3 uColor3;

out vec4 fragColor;

const float TAU = 6.2831853;

// Four interfering waves, summed as a single vec4 sin + dot
float signalField(vec2 p, float t) {
  vec4 w = sin(vec4(
    p.x * 1.3 + t * 0.7,
    p.y * 1.7 - t * 0.52,
    (p.x + p.y) * 0.9 + t * 0.91,
    (p.x - p.y) * 1.53 - t * 0.63
  ));
  return dot(w, vec4(1.0, 0.8, 0.6, 0.42)) * 0.35;
}

void main() {
  vec2 uv0 = (gl_FragCoord.xy * 2.0 - iResolution) / iResolution.y;

  float t = iTime * uSpeed;

  float axis = dot(uv0, uAxis) * uInvScale;
  float sig = signalField(uv0 * uFreqScale, t);
  float coord = axis + sig * uRipple;

  float phase = coord * uInvSweepWidth - t * uSweepSpeed;
  float sweep = pow(0.5 + 0.5 * cos(phase * TAU), uSweepFalloff);

  float lc = coord * uBandDensity;
  float aa = 1.0 / (1.0 + uSoftness * fwidth(lc) * 3.0);

  float bodyBase = clamp(0.5 + 0.5 * sig, 0.0, 1.0);
  float body = bodyBase * bodyBase * uGlow * sweep;

  // R/G/B are the same band sampled at three offsets — do all three at once
  vec3 bands = vec3(lc + uSplit, lc, lc - uSplit);
  vec3 v = mix(vec3(0.5), 0.5 + 0.5 * cos(bands * TAU), aa);
  vec3 f = clamp(pow(v, vec3(uLineSharpness)) * sweep + body, 0.0, 1.0);

  // Palette lookup, also per-channel: each component picks its own ramp position
  vec3 fc = pow(f, vec3(uContrast));
  vec3 col = mix(
    mix(uColor1, uColor2, smoothstep(0.08, 0.6, fc)),
    uColor3,
    smoothstep(0.68, 1.0, fc)
  );

  float inten = dot(f, vec3(0.3333333)) * uBrightness;

  if (uScanline > 0.0) {
    inten *= 1.0 - uScanline * (0.5 + 0.5 * cos(gl_FragCoord.y * 1.7));
  }

  if (uGrain > 0.0) {
    float g = fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233)) + iTime) * 43758.5453);
    inten += (g - 0.5) * uGrain;
  }

  inten *= clamp(1.0 - uVignette * smoothstep(0.55, 1.65, length(uv0)), 0.0, 1.0);
  inten = clamp(inten, 0.0, 1.0);

  float a = clamp(inten * uOpacity, 0.0, 1.0);
  fragColor = vec4(clamp(col, 0.0, 1.0) * a, a);
}
`;

type Uniforms = Record<string, { value: number | Float32Array }>;

const createUniforms = (): Uniforms => ({
	iTime: { value: 0 },
	iResolution: { value: new Float32Array([1, 1]) },
	uAxis: { value: new Float32Array([0, 1]) },
	uSpeed: { value: 0 },
	uSweepSpeed: { value: 0 },
	uInvSweepWidth: { value: 0 },
	uSweepFalloff: { value: 0 },
	uInvScale: { value: 0 },
	uFreqScale: { value: 0 },
	uRipple: { value: 0 },
	uBandDensity: { value: 0 },
	uLineSharpness: { value: 0 },
	uGlow: { value: 0 },
	uSplit: { value: 0 },
	uBrightness: { value: 0 },
	uContrast: { value: 0 },
	uSoftness: { value: 0 },
	uVignette: { value: 0 },
	uOpacity: { value: 0 },
	uScanline: { value: 0 },
	uGrain: { value: 0 },
	uColor1: { value: new Float32Array(3) },
	uColor2: { value: new Float32Array(3) },
	uColor3: { value: new Float32Array(3) },
});

const writeColor = (target: Float32Array, hex: string) => {
	const [r, g, b] = hexToRgb(hex);
	target[0] = r;
	target[1] = g;
	target[2] = b;
};

/**
 * Fold everything that doesn't vary per-fragment into the uniforms: clamps,
 * reciprocals and the on/off flags all become plain numbers the GPU reads once.
 */
const writeUniforms = (u: Uniforms, s: ScannerSettings) => {
	const invScale = 1 / Math.max(s.scale, 0.001);
	const axis = AXIS[s.scanDirection] ?? AXIS.vertical;
	const axisValue = u.uAxis.value as Float32Array;
	axisValue[0] = axis[0];
	axisValue[1] = axis[1];

	u.uSpeed.value = s.speed;
	u.uSweepSpeed.value = s.sweepSpeed;
	u.uInvSweepWidth.value = 1 / Math.max(s.sweepWidth, 0.05);
	u.uSweepFalloff.value = Math.max(s.sweepFalloff, 0.1);
	u.uInvScale.value = invScale;
	u.uFreqScale.value = s.frequency * invScale;
	u.uRipple.value = s.ripple;
	u.uBandDensity.value = s.bandDensity;
	u.uLineSharpness.value = Math.max(s.lineSharpness, 0.1);
	u.uGlow.value = s.glow;
	u.uSplit.value = s.colorSpread * 0.16;
	u.uBrightness.value = s.brightness;
	u.uContrast.value = s.contrast;
	u.uSoftness.value = s.softness;
	u.uVignette.value = s.vignette;
	u.uOpacity.value = s.opacity;
	u.uScanline.value = s.scanline ? 0.18 : 0;
	u.uGrain.value = s.grain ? s.grainIntensity : 0;

	writeColor(u.uColor1.value as Float32Array, s.color1);
	writeColor(u.uColor2.value as Float32Array, s.color2);
	writeColor(u.uColor3.value as Float32Array, s.color3);
};

type ScannerCtx = {
	uniforms: Uniforms;
	/** Gate the loop on window focus, which `visibilitychange` misses in Tauri */
	setWindowActive: (active: boolean) => void;
	/** Repaint after a settings change while the loop is parked */
	renderIfIdle: () => void;
};

const Scanner = ({
	color1 = "#5227FF",
	color2 = "#FF9FFC",
	color3 = "#FFFFFF",
	speed = 0.5,
	sweepSpeed = 0.25,
	sweepWidth = 1.6,
	sweepFalloff = 6,
	scale = 1.5,
	frequency = 2,
	ripple = 0.22,
	bandDensity = 11,
	lineSharpness = 5.5,
	glow = 0.22,
	scanDirection = "vertical",
	colorSpread = 0.7,
	brightness = 1.0,
	contrast = 1.15,
	softness = 1.4,
	vignette = 0.45,
	scanline = true,
	grain = true,
	grainIntensity = 0.05,
	opacity = 1.0,
	fps = 30,
	maxDpr = 1.5,
	className = "",
}: ScannerProps) => {
	const containerRef = useRef<HTMLDivElement | null>(null);
	const ctxRef = useRef<ScannerCtx | null>(null);
	const windowActive = useWindowActive();

	const settings: ScannerSettings = {
		color1,
		color2,
		color3,
		speed,
		sweepSpeed,
		sweepWidth,
		sweepFalloff,
		scale,
		frequency,
		ripple,
		bandDensity,
		lineSharpness,
		glow,
		scanDirection,
		colorSpread,
		brightness,
		contrast,
		softness,
		vignette,
		scanline,
		grain,
		grainIntensity,
		opacity,
	};

	// Seed the very first frame from props rather than re-declaring defaults
	const settingsRef = useRef(settings);
	settingsRef.current = settings;

	const frameIntervalRef = useRef(1000 / fps);
	frameIntervalRef.current = 1000 / Math.max(fps, 1);

	useEffect(() => {
		const container = containerRef.current;
		if (!container) return;

		const renderer = new Renderer({
			webgl: 2,
			alpha: true,
			premultipliedAlpha: true,
			antialias: false,
			depth: false,
			stencil: false,
			powerPreference: "low-power",
			dpr: Math.min(window.devicePixelRatio || 1, maxDpr),
		});

		const gl = renderer.gl;
		gl.clearColor(0, 0, 0, 0);
		const canvas = gl.canvas as HTMLCanvasElement;
		canvas.style.width = "100%";
		canvas.style.height = "100%";
		canvas.style.display = "block";
		container.appendChild(canvas);

		const uniforms = createUniforms();
		writeUniforms(uniforms, settingsRef.current);

		const geometry = new Triangle(gl);
		const program = new Program(gl, {
			vertex,
			fragment,
			uniforms,
			depthTest: false,
			depthWrite: false,
		});
		const mesh = new Mesh(gl, { geometry, program });

		const draw = () => renderer.render({ scene: mesh });

		const setSize = () => {
			const rect = container.getBoundingClientRect();
			renderer.setSize(
				Math.max(1, Math.floor(rect.width)),
				Math.max(1, Math.floor(rect.height)),
			);
			const res = uniforms.iResolution.value as Float32Array;
			res[0] = gl.drawingBufferWidth;
			res[1] = gl.drawingBufferHeight;
			draw();
		};

		const ro = new ResizeObserver(setSize);
		ro.observe(container);
		setSize();

		let raf = 0;
		let inView = true;
		let pageVisible = !document.hidden;
		let focused = true;
		// Accumulate our own clock so pausing doesn't jump the animation forward
		let elapsed = 0;
		let lastFrame = 0;

		const loop = (now: number) => {
			raf = requestAnimationFrame(loop);

			const interval = frameIntervalRef.current;
			const delta = now - lastFrame;
			// 1ms of slack, otherwise vsync jitter drops us to half the target rate
			if (delta < interval - 1) return;
			lastFrame = now;

			elapsed += Math.min(delta, 100);
			uniforms.iTime.value = elapsed * 0.001;
			draw();
		};

		const sync = () => {
			const shouldRun = inView && pageVisible && focused;
			if (shouldRun && raf === 0) {
				lastFrame = performance.now();
				raf = requestAnimationFrame(loop);
			} else if (!shouldRun && raf !== 0) {
				cancelAnimationFrame(raf);
				raf = 0;
			}
		};

		const io = new IntersectionObserver(
			([entry]) => {
				inView = entry.isIntersecting;
				sync();
			},
			{ threshold: 0 },
		);
		io.observe(container);

		const onVisibility = () => {
			pageVisible = !document.hidden;
			sync();
		};
		document.addEventListener("visibilitychange", onVisibility);

		ctxRef.current = {
			uniforms,
			setWindowActive: (active) => {
				focused = active;
				sync();
			},
			renderIfIdle: () => {
				if (raf === 0) draw();
			},
		};

		sync();

		return () => {
			if (raf !== 0) cancelAnimationFrame(raf);
			ro.disconnect();
			io.disconnect();
			document.removeEventListener("visibilitychange", onVisibility);
			ctxRef.current = null;
			canvas.remove();
			gl.getExtension("WEBGL_lose_context")?.loseContext();
		};
	}, [maxDpr]);

	useEffect(() => {
		ctxRef.current?.setWindowActive(windowActive);
	}, [windowActive]);

	// Cheap enough to run on every render — `memo` keeps those to prop changes
	useEffect(() => {
		const ctx = ctxRef.current;
		if (!ctx) return;
		writeUniforms(ctx.uniforms, settingsRef.current);
		ctx.renderIfIdle();
	});

	return (
		<div
			ref={containerRef}
			className={`relative h-full w-full overflow-hidden ${className}`.trim()}
		/>
	);
};

export default memo(Scanner);
