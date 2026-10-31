import { Mesh, Program, Renderer, Triangle } from "ogl";
import { type CSSProperties, memo, useEffect, useRef } from "react";
import { useWindowActive } from "@/lib/hooks/use-window-active";

export type ColorMode = "elevation" | "uniform" | "alternating";

export interface TopographyProps {
	lowColor?: string;
	midColor?: string;
	highColor?: string;
	speed?: number;
	morphAmount?: number;
	morphSpeed?: number;
	bands?: number;
	thickness?: number;
	scale?: number;
	pixelSize?: number;
	glow?: number;
	colorMode?: ColorMode;
	contrast?: number;
	brightness?: number;
	fillBands?: boolean;
	opacity?: number;
	grain?: boolean;
	grainIntensity?: number;
	lightMode?: boolean;
	dpr?: number;
	fps?: number;
	paused?: boolean;
	className?: string;
	style?: CSSProperties;
	/** Fires once the first frame has actually been drawn. */
	onReady?: () => void;
}

/** rAF lands on the next vsync after the timer, so aim slightly early. */
const FRAME_SLACK_MS = 6;

/**
 * The sixteen control values are sinusoids whose frequency only depends on
 * `morphSpeed`, so the inner sine is folded into a table (see `rates`) instead
 * of being recomputed sixteen times a frame. Row-major: 0-3 feed uCtrlA, 4-7
 * uCtrlB, and so on.
 */
const CTRL_SEEDS = [1, -2, 3, -4, 9, -8, 7, -6, 5, 2, 5, -5, -1, -3, 8, 9];

const writeRgb = (hex: string, out: Float32Array) => {
	const match = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
	if (!match) {
		out.fill(1);
		return;
	}
	out[0] = Number.parseInt(match[1], 16) / 255;
	out[1] = Number.parseInt(match[2], 16) / 255;
	out[2] = Number.parseInt(match[3], 16) / 255;
};

const colorModeToFloat = (mode: ColorMode): number => {
	if (mode === "uniform") return 1;
	if (mode === "alternating") return 2;
	return 0;
};

const vertex = `#version 300 es
in vec2 position;

void main() {
  gl_Position = vec4(position, 0.0, 1.0);
}
`;

/**
 * Anything that depends only on the props is folded into a uniform on the CPU,
 * so the fragment shader never divides by, clamps or re-derives a constant that
 * is the same for every one of the couple million pixels it touches.
 */
const fragment = `#version 300 es
precision highp float;

uniform vec2 uResolution;
// Resolution divided by the pixel size, precomputed on resize
uniform vec2 uPixelCells;
uniform float uPixelate;
// 1 / scale
uniform float uInvScale;
uniform float uBands;
uniform float uThickness;
// thickness + glow * 0.5
uniform float uGlowEdge;
uniform float uGlowOn;
uniform float uColorMode;
uniform float uContrast;
uniform float uBrightness;
uniform float uFillBands;
uniform float uOpacity;
uniform float uLightMode;
// 1 / (morphAmount * 2.5), the field value that counts as full elevation
uniform float uElevScale;
// Grain intensity; zero disables it
uniform float uGrain;
uniform float uGrainSeed;
uniform vec3 uLow;
uniform vec3 uMid;
uniform vec3 uHigh;
uniform vec4 uCtrlA;
uniform vec4 uCtrlB;
uniform vec4 uCtrlC;
uniform vec4 uCtrlD;
out vec4 fragColor;

float hash21(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}

/**
 * All four control curves are sampled at just two parameters - uv.x and uv.y -
 * so each one's sine and cosine pair is computed once and shared, and the
 * double-angle terms are derived from that pair rather than from two more
 * transcendentals. Sixteen sin/cos per pixel become four.
 */
vec4 harmonics(float t) {
  float w = 6.2831853 * t;
  float s = sin(w);
  float c = cos(w);
  return 0.5 * vec4(s, c, 2.0 * s * c, 1.0 - 2.0 * s * s);
}

float field(vec2 uv) {
  vec4 hx = harmonics(uv.x);
  vec4 hy = harmonics(uv.y);
  vec2 a = vec2(dot(hx, uCtrlA), dot(hx, uCtrlB));
  vec2 b = vec2(dot(hy, uCtrlC), dot(hy, uCtrlD));
  return distance(a, b);
}

vec3 elevationColor(float e) {
  vec3 c = mix(uLow, uMid, smoothstep(0.0, 0.5, e));
  return mix(c, uHigh, smoothstep(0.5, 1.0, e));
}

void main() {
  vec2 uv = gl_FragCoord.xy / uResolution;
  vec2 suv = (uv - 0.5) * uInvScale + 0.5;
  if (uPixelate > 0.5) {
    suv = (floor(suv * uPixelCells) + 0.5) / uPixelCells;
  }

  float fv = field(suv);
  float f = fv * uBands;
  float frac = fract(f);
  float lineDist = min(frac, 1.0 - frac);

  float aa = fwidth(f) + 0.0001;
  float mask = 1.0 - smoothstep(uThickness - aa, uThickness + aa, lineDist);
  float glow = (1.0 - smoothstep(uThickness, uGlowEdge + aa, lineDist)) * uGlowOn;

  float elev = clamp(fv * uElevScale, 0.0, 1.0);

  vec3 lineCol;
  if (uColorMode < 0.5) {
    lineCol = elevationColor(elev);
  } else if (uColorMode < 1.5) {
    lineCol = uMid;
  } else {
    lineCol = mix(uMid, uHigh, mod(floor(f), 2.0));
  }

  float coverage = pow(clamp(mask + glow * 0.55, 0.0, 1.0), uContrast);

  vec3 outColor = lineCol;
  float outAlpha = coverage;

  if (uFillBands > 0.5) {
    // In elevation mode the fill and the line are the same ramp, so the second
    // evaluation is skipped rather than repeated
    vec3 fillCol = uColorMode < 0.5 ? lineCol : elevationColor(elev);
    outColor = mix(fillCol, lineCol, coverage);
    outAlpha = clamp(coverage + 0.1 * elev, 0.0, 1.0);
  }

  if (uGrain > 0.0) {
    outAlpha += (hash21(gl_FragCoord.xy + uGrainSeed) - 0.5) * uGrain;
  }

  outColor = clamp(outColor * uBrightness, 0.0, 1.0);
  float a = clamp(outAlpha, 0.0, 1.0) * uOpacity;

  if (uLightMode > 0.5) {
    float peak = max(outColor.r, max(outColor.g, outColor.b));
    vec3 chroma = pow(clamp(outColor / max(peak, 0.0001), 0.0, 1.0), vec3(1.18));
    fragColor = vec4(mix(vec3(1.0), chroma, a * 0.94), 1.0);
  } else {
    fragColor = vec4(outColor * a, a);
  }
}
`;

export const Topography = memo(
	({
		lowColor = "#5227FF",
		midColor = "#FF9FFC",
		highColor = "#FFFFFF",
		speed = 0.35,
		morphAmount = 3,
		morphSpeed = 0.05,
		bands = 2,
		thickness = 0.01,
		scale = 1,
		pixelSize = 1,
		glow = 0.5,
		colorMode = "elevation",
		contrast = 3,
		brightness = 1,
		fillBands = false,
		opacity = 1,
		grain = true,
		grainIntensity = 0.05,
		lightMode = false,
		dpr = 1,
		fps = 30,
		paused = false,
		className,
		style,
		onReady,
	}: TopographyProps) => {
		const windowActive = useWindowActive();

		const containerRef = useRef<HTMLDivElement | null>(null);
		const programRef = useRef<InstanceType<typeof Program> | null>(null);
		const rendererRef = useRef<InstanceType<typeof Renderer> | null>(null);
		const fpsRef = useRef(fps);
		const speedRef = useRef(speed);
		const morphRef = useRef(morphAmount);
		const pixelSizeRef = useRef(pixelSize);
		/** sin(seed * morphSpeed) for each control value, refreshed with the prop. */
		const ratesRef = useRef<Float32Array>(new Float32Array(16));
		/**
		 * Gates on the animation loop. The loop is torn down whenever any of them
		 * closes rather than left spinning on early returns, so an offscreen or
		 * backgrounded canvas costs nothing at all.
		 */
		const gatesRef = useRef({
			visible: true,
			documentVisible: true,
			windowActive: true,
			playing: !paused,
		});
		const syncLoopRef = useRef<() => void>(() => {});
		const renderOnceRef = useRef<() => void>(() => {});
		const resizeRef = useRef<() => void>(() => {});
		const onReadyRef = useRef(onReady);

		// Declared above the setup effect so the ref is filled before the first draw
		useEffect(() => {
			onReadyRef.current = onReady;
		}, [onReady]);

		useEffect(() => {
			fpsRef.current = Math.max(1, fps);
		}, [fps]);

		useEffect(() => {
			speedRef.current = speed;
		}, [speed]);

		useEffect(() => {
			const container = containerRef.current;
			if (!container) return undefined;

			const renderer = new Renderer({
				webgl: 2,
				alpha: true,
				premultipliedAlpha: true,
				antialias: false,
				// Nothing is ever occluded by anything, so the depth buffer is pure
				// allocation and bandwidth
				depth: false,
				stencil: false,
				powerPreference: "low-power",
			});
			rendererRef.current = renderer;
			// The triangle overwrites every pixel, alpha included, so the clear
			// before each draw is wasted bandwidth
			renderer.autoClear = false;
			renderer.dpr = Math.min(window.devicePixelRatio || 1, dpr);

			const gl = renderer.gl;
			const canvas = gl.canvas as HTMLCanvasElement;
			canvas.style.width = "100%";
			canvas.style.height = "100%";
			canvas.style.display = "block";
			container.appendChild(canvas);

			const geometry = new Triangle(gl);
			const program = new Program(gl, {
				vertex,
				fragment,
				depthTest: false,
				depthWrite: false,
				cullFace: false,
				uniforms: {
					uResolution: { value: new Float32Array([1, 1]) },
					uPixelCells: { value: new Float32Array([1, 1]) },
					uPixelate: { value: 0 },
					// Every prop-derived uniform below is filled in by the sync effect
					// that runs right after this one, before the first paint
					uInvScale: { value: 1 },
					uBands: { value: 2 },
					uThickness: { value: 0.01 },
					uGlowEdge: { value: 0.01 },
					uGlowOn: { value: 0 },
					uColorMode: { value: 0 },
					uContrast: { value: 1 },
					uBrightness: { value: 1 },
					uFillBands: { value: 0 },
					uOpacity: { value: 1 },
					uLightMode: { value: 0 },
					uElevScale: { value: 1 },
					uGrain: { value: 0 },
					uGrainSeed: { value: 0 },
					uLow: { value: new Float32Array(3) },
					uMid: { value: new Float32Array(3) },
					uHigh: { value: new Float32Array(3) },
					uCtrlA: { value: new Float32Array(4) },
					uCtrlB: { value: new Float32Array(4) },
					uCtrlC: { value: new Float32Array(4) },
					uCtrlD: { value: new Float32Array(4) },
				},
			});
			programRef.current = program;

			const mesh = new Mesh(gl, { geometry, program });
			const uniforms = program.uniforms;
			const ctrl = [
				uniforms.uCtrlA.value as Float32Array,
				uniforms.uCtrlB.value as Float32Array,
				uniforms.uCtrlC.value as Float32Array,
				uniforms.uCtrlD.value as Float32Array,
			];

			let time = 0;
			let rafId: number | null = null;
			let timerId: number | null = null;
			let readyRafId: number | null = null;
			let hasDrawn = false;
			let nextFrameAt = 0;
			let lastTickAt = 0;

			const draw = () => {
				const morph = morphRef.current;
				const rates = ratesRef.current;
				for (let i = 0; i < 16; i++) {
					ctrl[i >> 2][i & 3] =
						morph * Math.sin(time * rates[i] + CTRL_SEEDS[i]);
				}
				uniforms.uGrainSeed.value = (time % 1) * 173;
				renderer.render({ scene: mesh });

				/**
				 * render() only queues the draw, so the caller is told a frame later —
				 * by then there are pixels on the canvas and it is safe to reveal.
				 */
				if (!hasDrawn) {
					hasDrawn = true;
					readyRafId = requestAnimationFrame(() => {
						readyRafId = null;
						onReadyRef.current?.();
					});
				}
			};
			renderOnceRef.current = draw;

			const tick = () => {
				rafId = null;
				const now = performance.now();
				time += Math.min((now - lastTickAt) / 1000, 0.1) * speedRef.current;
				lastTickAt = now;
				draw();
				schedule();
			};

			const schedule = () => {
				nextFrameAt += 1000 / fpsRef.current;
				const now = performance.now();
				// Recover the cadence after a stall instead of bursting to catch up
				if (nextFrameAt < now) nextFrameAt = now;
				timerId = window.setTimeout(
					() => {
						timerId = null;
						rafId = requestAnimationFrame(tick);
					},
					Math.max(0, nextFrameAt - now - FRAME_SLACK_MS),
				);
			};

			const running = () => rafId !== null || timerId !== null;

			const syncLoop = () => {
				const gates = gatesRef.current;
				const shouldRun =
					gates.visible &&
					gates.documentVisible &&
					gates.windowActive &&
					gates.playing;
				if (shouldRun === running()) return;
				if (shouldRun) {
					lastTickAt = performance.now();
					nextFrameAt = lastTickAt;
					schedule();
					return;
				}
				if (rafId !== null) cancelAnimationFrame(rafId);
				if (timerId !== null) clearTimeout(timerId);
				rafId = null;
				timerId = null;
			};
			syncLoopRef.current = syncLoop;

			const resize = () => {
				const width = Math.max(container.clientWidth, 1);
				const height = Math.max(container.clientHeight, 1);
				renderer.setSize(width, height);
				const resolution = uniforms.uResolution.value as Float32Array;
				resolution[0] = gl.drawingBufferWidth;
				resolution[1] = gl.drawingBufferHeight;
				const cells = uniforms.uPixelCells.value as Float32Array;
				const pixels = Math.max(pixelSizeRef.current, 1);
				cells[0] = Math.max(resolution[0] / pixels, 1);
				cells[1] = Math.max(resolution[1] / pixels, 1);
				// A resized drawing buffer comes back blank, so repaint it even when
				// the loop is parked
				if (hasDrawn && !running()) draw();
			};
			resizeRef.current = resize;

			const resizeObserver = new ResizeObserver(resize);
			resizeObserver.observe(container);
			resize();

			const visibilityObserver = new IntersectionObserver(([entry]) => {
				gatesRef.current.visible = entry.isIntersecting;
				syncLoop();
			});
			visibilityObserver.observe(container);

			const onDocumentVisibility = () => {
				gatesRef.current.documentVisible = !document.hidden;
				syncLoop();
			};
			document.addEventListener("visibilitychange", onDocumentVisibility);

			syncLoop();

			return () => {
				if (rafId !== null) cancelAnimationFrame(rafId);
				if (timerId !== null) clearTimeout(timerId);
				if (readyRafId !== null) cancelAnimationFrame(readyRafId);
				document.removeEventListener("visibilitychange", onDocumentVisibility);
				resizeObserver.disconnect();
				visibilityObserver.disconnect();
				syncLoopRef.current = () => {};
				renderOnceRef.current = () => {};
				resizeRef.current = () => {};
				programRef.current = null;
				rendererRef.current = null;
				canvas.remove();
				gl.getExtension("WEBGL_lose_context")?.loseContext();
			};
		}, []);

		useEffect(() => {
			gatesRef.current.playing = !paused;
			syncLoopRef.current();
		}, [paused]);

		useEffect(() => {
			gatesRef.current.windowActive = windowActive;
			syncLoopRef.current();
		}, [windowActive]);

		useEffect(() => {
			const program = programRef.current;
			if (!program) return;
			const uniforms = program.uniforms;

			writeRgb(lowColor, uniforms.uLow.value as Float32Array);
			writeRgb(midColor, uniforms.uMid.value as Float32Array);
			writeRgb(highColor, uniforms.uHigh.value as Float32Array);

			uniforms.uInvScale.value = 1 / Math.max(scale, 0.001);
			uniforms.uBands.value = bands;
			uniforms.uThickness.value = thickness;
			uniforms.uGlowEdge.value = thickness + glow * 0.5;
			uniforms.uGlowOn.value = glow > 0.0001 ? 1 : 0;
			uniforms.uColorMode.value = colorModeToFloat(colorMode);
			uniforms.uContrast.value = Math.max(contrast, 0.001);
			uniforms.uBrightness.value = brightness;
			uniforms.uFillBands.value = fillBands ? 1 : 0;
			uniforms.uOpacity.value = opacity;
			uniforms.uLightMode.value = lightMode ? 1 : 0;
			uniforms.uElevScale.value = 1 / (morphAmount * 2.5 + 0.001);
			uniforms.uGrain.value = grain ? grainIntensity : 0;

			morphRef.current = morphAmount;

			const rates = ratesRef.current;
			for (let i = 0; i < 16; i++) {
				rates[i] = Math.sin(CTRL_SEEDS[i] * morphSpeed);
			}

			uniforms.uPixelate.value = pixelSize > 1 ? 1 : 0;
			// The cell grid is derived from the drawing buffer, so it is the resize
			// path that owns it
			if (pixelSizeRef.current !== pixelSize) {
				pixelSizeRef.current = pixelSize;
				resizeRef.current();
			}

			renderOnceRef.current();
		}, [
			bands,
			brightness,
			colorMode,
			contrast,
			fillBands,
			glow,
			grain,
			grainIntensity,
			highColor,
			lightMode,
			lowColor,
			midColor,
			morphAmount,
			morphSpeed,
			opacity,
			pixelSize,
			scale,
			thickness,
		]);

		useEffect(() => {
			const renderer = rendererRef.current;
			if (!renderer) return;
			renderer.dpr = Math.min(window.devicePixelRatio || 1, dpr);
			resizeRef.current();
			renderOnceRef.current();
		}, [dpr]);

		return (
			<div
				ref={containerRef}
				className={`relative h-full w-full overflow-hidden ${className || ""}`}
				style={style}
			/>
		);
	},
);

Topography.displayName = "Topography";

export default Topography;
