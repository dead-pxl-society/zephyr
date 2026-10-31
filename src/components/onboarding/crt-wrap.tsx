import { type CSSProperties, memo, useEffect, useRef } from "react";
import * as THREE from "three";
import { useWindowActive } from "@/lib/hooks/use-window-active";

interface CRTWarpProps {
	color?: string;
	backgroundColor?: string;
	/**
	 * Punches the background out to alpha instead of painting
	 * `backgroundColor`. Read once, when the renderer is created.
	 */
	transparent?: boolean;
	speed?: number;
	curvature?: number;
	scanlineStrength?: number;
	scanlineFrequency?: number;
	waveAmplitude?: number;
	waveFrequency?: number;
	bloom?: number;
	bloomRadius?: number;
	noise?: number;
	vignette?: number;
	brightness?: number;
	pixelation?: number;
	rgbShift?: number;
	dpr?: number;
	fps?: number;
	paused?: boolean;
	className?: string;
	style?: CSSProperties;
	/** Fires once the first frame has actually been drawn. */
	onReady?: () => void;
}

/**
 * A fullscreen triangle instead of a quad: one less vertex, and none of the
 * pixels along the quad's diagonal get shaded twice.
 */
const TRIANGLE_POSITIONS = new Float32Array([-1, -1, 0, 3, -1, 0, -1, 3, 0]);
const TRIANGLE_UVS = new Float32Array([0, 0, 2, 0, 0, 2]);

/** rAF lands on the next vsync after the timer, so aim slightly early. */
const FRAME_SLACK_MS = 6;

const vertexShader = `
varying vec2 vUv;

void main() {
  vUv = uv;
  gl_Position = vec4(position, 1.0);
}
`;

/**
 * Everything that depends only on time or on the props is folded into uniforms
 * on the CPU, so the fragment shader never recomputes a constant. The plasma is
 * evaluated eleven times per pixel (once for the signal, eight for the bloom,
 * two for the chroma split) — anything hoisted out of it is saved eleven times
 * over.
 */
const fragmentShader = `
precision highp float;

varying vec2 vUv;
uniform vec2 uResolution;
uniform float uTime;
uniform vec3 uColor;
uniform vec3 uBackgroundColor;
// (safeRadius, safeRadius^2, 1 / cornerScale)
uniform vec3 uCurve;
uniform float uScanBias;
uniform float uScanAmp;
uniform float uScanPhase;
uniform float uAmplitude;
uniform float uFreqScale;
uniform float uBloomScale;
uniform float uGlowRadius;
uniform float uNoise;
uniform float uVignette;
uniform float uBrightness;
uniform float uPixelation;
uniform float uRgbShift;
uniform float uGrainSeed;
// (sin(t / 2), cos(t / 5), cos(t / 4), sin(t))
uniform vec4 uTrig;
// (t / 2, t / 5)
uniform vec2 uTimeScaled;

const vec2 CELLS = vec2(80.0, 24.0);

float hash21(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}

vec2 crtCurve(vec2 uv) {
  vec2 p = (uv - 0.5) * 2.0;
  p *= uCurve.x * uCurve.z * inversesqrt(max(uCurve.y - dot(p, p), 0.001));
  return p * 0.5 + 0.5;
}

/**
 * The scanline only ever depends on y, and the eleven plasma taps share just
 * three distinct y values - so it is lifted out of the plasma itself.
 */
float scanline(float y) {
  return uScanBias - uScanAmp * cos(y * uScanPhase);
}

/* p is already in plasma space; the scanline is applied by the caller. */
float plasma(vec2 p) {
  p = ceil(p * CELLS) / CELLS;

  float field = 0.7 * sin(0.5 * p.x + uTimeScaled.y);
  field += 3.0 * sin(1.6 * p.y + uTimeScaled.y);
  field += sin(10.0 * (p.y * uTrig.x + p.x * uTrig.y) + uTimeScaled.x);

  vec2 c = p + vec2(0.5 * uTrig.x, 0.5 * uTrig.z);
  vec2 cc = c * c;
  field += 0.4 * sin(sqrt(100.0 * cc.x + 100.0 * cc.y + 1.0) + uTime);
  field += 0.9 * sin(sqrt(75.0 * cc.x + 25.0 * cc.y + 1.0) + uTime);
  field -= 1.4 * sin(sqrt(256.0 * cc.x + 25.0 * cc.y + 1.0) + uTime);
  field += 0.3 * sin(0.5 * p.y + p.x + uTrig.w);

  return floor(3.0 * (0.5 + 0.499 * sin(field * uAmplitude))) / 3.0;
}

void main() {
  vec2 uv = vUv;
  if (uPixelation > 1.001) {
    vec2 cells = max(uResolution / uPixelation, vec2(1.0));
    uv = (floor(uv * cells) + 0.5) / cells;
  }

  // Plasma space, so the tap offsets below are scaled once instead of per tap
  vec2 p = (crtCurve(uv) - 0.5) * uFreqScale + 0.5;
  float r = uGlowRadius * uFreqScale;
  float shift = uRgbShift * uFreqScale;

  float scanMid = scanline(p.y);
  float scanUp = scanline(p.y + r);
  float scanDown = scanline(p.y - r);

  float signal = scanMid * plasma(p);
  float glow = signal * 0.2;
  glow += scanMid * plasma(p + vec2(r, 0.0)) * 0.12;
  glow += scanMid * plasma(p - vec2(r, 0.0)) * 0.12;
  glow += scanUp * plasma(p + vec2(0.0, r)) * 0.12;
  glow += scanDown * plasma(p - vec2(0.0, r)) * 0.12;
  glow += scanUp * plasma(p + vec2(r)) * 0.08;
  glow += scanDown * plasma(p - vec2(r)) * 0.08;
  glow += scanDown * plasma(p + vec2(r, -r)) * 0.08;
  glow += scanUp * plasma(p + vec2(-r, r)) * 0.08;

  float redSignal = scanMid * plasma(p + vec2(shift, 0.0));
  float blueSignal = scanMid * plasma(p - vec2(shift, 0.0));
  vec3 channelSignal = vec3(redSignal, signal, blueSignal);
  vec3 waveColor = uColor * (0.3 + signal * 0.7 + glow * uBloomScale);
  waveColor += (channelSignal - signal) * 0.42;

  float edge = clamp(1.0 - dot(vUv - 0.5, vUv - 0.5) * 2.0, 0.0, 1.0);
  float edgeFade = mix(1.0, smoothstep(0.0, 1.0, edge), uVignette);
  float waveMask = clamp(signal * 0.82 + glow * 0.52, 0.0, 1.0) * edgeFade;

  float grain = (hash21(gl_FragCoord.xy + vec2(uGrainSeed)) - 0.5) * uNoise;
  waveColor = max(waveColor * uBrightness, vec3(0.0));

#ifdef TRANSPARENT_BACKGROUND
  // Compositing the wave onto whatever sits behind the canvas is the same
  // operation as the mix() below, so nothing about the wave changes as long as
  // that surface is the color this used to paint. Grain is the one part that
  // cannot carry over intact: over an empty pixel it can only add light, never
  // subtract it, so only its bright half lifts the mask
  vec3 color = waveColor + grain;
  float alpha = clamp(waveMask + max(grain, 0.0), 0.0, 1.0);
#else
  vec3 color = mix(uBackgroundColor, waveColor, waveMask) + grain;
  float alpha = 1.0;
#endif

  gl_FragColor = vec4(max(color, vec3(0.0)), alpha);
}
`;

export const CRTWarp = memo(
	({
		color = "#c755f7",
		backgroundColor = "#05010a",
		transparent = false,
		speed = 0.5,
		curvature = 0.25,
		scanlineStrength = 0.25,
		scanlineFrequency = 200,
		waveAmplitude = 0.3,
		waveFrequency = 2.5,
		bloom = 1.5,
		bloomRadius = 1,
		noise = 0.1,
		vignette = 0,
		brightness = 1.25,
		pixelation = 1,
		rgbShift = 0.015,
		dpr = 1,
		fps = 24,
		paused = false,
		className,
		style,
		onReady,
	}: CRTWarpProps) => {
		const windowActive = useWindowActive();

		const containerRef = useRef<HTMLDivElement | null>(null);
		const materialRef = useRef<THREE.ShaderMaterial | null>(null);
		const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
		const fpsRef = useRef(fps);
		const speedRef = useRef(speed);
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

			const scene = new THREE.Scene();
			scene.matrixAutoUpdate = false;
			const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
			const geometry = new THREE.BufferGeometry();
			geometry.setAttribute(
				"position",
				new THREE.BufferAttribute(TRIANGLE_POSITIONS, 3),
			);
			geometry.setAttribute("uv", new THREE.BufferAttribute(TRIANGLE_UVS, 2));

			const material = new THREE.ShaderMaterial({
				defines: transparent ? { TRANSPARENT_BACKGROUND: 1 } : {},
				vertexShader,
				fragmentShader,
				depthTest: false,
				depthWrite: false,
				// The triangle writes every channel of every pixel it covers, so
				// there is never anything underneath for a blend to read
				blending: THREE.NoBlending,
				uniforms: {
					uResolution: { value: new THREE.Vector2(1, 1) },
					uTime: { value: 0 },
					// Every prop-derived uniform below is filled in by the sync effect
					// that runs right after this one, before the first paint
					uColor: { value: new THREE.Color() },
					uBackgroundColor: { value: new THREE.Color() },
					uCurve: { value: new THREE.Vector3(1.415, 2.0, 1) },
					uScanBias: { value: 1 },
					uScanAmp: { value: 0 },
					uScanPhase: { value: 0 },
					uAmplitude: { value: 1 },
					uFreqScale: { value: 1 },
					uBloomScale: { value: 1 },
					uGlowRadius: { value: 0.01 },
					uNoise: { value: 0.1 },
					uVignette: { value: 0 },
					uBrightness: { value: 1.25 },
					uPixelation: { value: 1 },
					uRgbShift: { value: 0.015 },
					uGrainSeed: { value: 0 },
					uTrig: { value: new THREE.Vector4(0, 1, 1, 0) },
					uTimeScaled: { value: new THREE.Vector2(0, 0) },
				},
			});
			materialRef.current = material;

			const mesh = new THREE.Mesh(geometry, material);
			// The triangle is already in clip space, so it must never be culled
			mesh.frustumCulled = false;
			mesh.matrixAutoUpdate = false;
			scene.add(mesh);

			const renderer = new THREE.WebGLRenderer({
				antialias: false,
				alpha: transparent,
				// The shader emits straight alpha; let the compositor premultiply
				premultipliedAlpha: false,
				depth: false,
				stencil: false,
				powerPreference: "low-power",
			});
			rendererRef.current = renderer;
			// The triangle overwrites every pixel, alpha included, so the clear
			// before each draw is pure wasted bandwidth
			renderer.autoClear = false;
			renderer.outputColorSpace = THREE.SRGBColorSpace;
			renderer.domElement.style.width = "100%";
			renderer.domElement.style.height = "100%";
			renderer.domElement.style.display = "block";
			container.appendChild(renderer.domElement);

			let time = 0;
			let rafId: number | null = null;
			let timerId: number | null = null;
			let readyRafId: number | null = null;
			let notified = false;
			let nextFrameAt = 0;
			let lastTickAt = 0;

			const draw = () => {
				const uniforms = material.uniforms;
				uniforms.uTime.value = time;
				uniforms.uTimeScaled.value.set(time * 0.5, time * 0.2);
				uniforms.uTrig.value.set(
					Math.sin(time * 0.5),
					Math.cos(time * 0.2),
					Math.cos(time * 0.25),
					Math.sin(time),
				);
				uniforms.uGrainSeed.value = (time % 1) * 173;
				renderer.render(scene, camera);

				/**
				 * render() only queues the draw, so the caller is told a frame later —
				 * by then there are pixels on the canvas and it is safe to reveal.
				 */
				if (!notified) {
					notified = true;
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
				const interval = 1000 / fpsRef.current;
				nextFrameAt += interval;
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
				renderer.setSize(width, height, false);
				material.uniforms.uResolution.value.set(
					renderer.domElement.width,
					renderer.domElement.height,
				);
				// A resized drawing buffer comes back blank, so repaint it even when
				// the loop is parked
				if (!running()) draw();
			};

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
				geometry.dispose();
				material.dispose();
				renderer.dispose();
				renderer.domElement.remove();
				syncLoopRef.current = () => {};
				renderOnceRef.current = () => {};
				materialRef.current = null;
				rendererRef.current = null;
			};
		}, [transparent]);

		useEffect(() => {
			gatesRef.current.playing = !paused;
			syncLoopRef.current();
		}, [paused]);

		useEffect(() => {
			gatesRef.current.windowActive = windowActive;
			syncLoopRef.current();
		}, [windowActive]);

		useEffect(() => {
			const material = materialRef.current;
			if (!material) return;
			const uniforms = material.uniforms;

			uniforms.uColor.value.set(color);
			uniforms.uBackgroundColor.value.set(backgroundColor);

			// The barrel distortion is the same for every pixel — solve it once here
			const safeRadius = Math.max(
				1.1 + 0.42 / Math.max(curvature, 0.001),
				1.415,
			);
			const squared = safeRadius * safeRadius;
			const cornerScale = safeRadius / Math.sqrt(Math.max(squared - 2, 0.001));
			uniforms.uCurve.value.set(safeRadius, squared, 1 / cornerScale);

			// mix(1, 0.5 - 0.5 * cos(...), strength) with the constants folded in
			uniforms.uScanBias.value = 1 - scanlineStrength * 0.5;
			uniforms.uScanAmp.value = scanlineStrength * 0.5;
			uniforms.uScanPhase.value = Math.PI * scanlineFrequency;

			uniforms.uAmplitude.value = waveAmplitude / 0.28;
			uniforms.uFreqScale.value = Math.max(waveFrequency / 2.2, 0.001);
			uniforms.uBloomScale.value = bloom * 0.65;
			uniforms.uGlowRadius.value = 0.01 * bloomRadius;
			uniforms.uNoise.value = noise;
			uniforms.uVignette.value = vignette;
			uniforms.uBrightness.value = brightness;
			uniforms.uPixelation.value = pixelation;
			uniforms.uRgbShift.value = rgbShift;

			renderOnceRef.current();
		}, [
			backgroundColor,
			bloom,
			bloomRadius,
			brightness,
			color,
			curvature,
			noise,
			pixelation,
			rgbShift,
			scanlineFrequency,
			scanlineStrength,
			vignette,
			waveAmplitude,
			waveFrequency,
		]);

		useEffect(() => {
			const renderer = rendererRef.current;
			const material = materialRef.current;
			const container = containerRef.current;
			if (!renderer || !material || !container) return;
			renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, dpr));
			renderer.setSize(
				Math.max(container.clientWidth, 1),
				Math.max(container.clientHeight, 1),
				false,
			);
			material.uniforms.uResolution.value.set(
				renderer.domElement.width,
				renderer.domElement.height,
			);
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

CRTWarp.displayName = "CRTWarp";

export default CRTWarp;
