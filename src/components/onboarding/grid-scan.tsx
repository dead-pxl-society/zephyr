import {
	BloomEffect,
	ChromaticAberrationEffect,
	EffectComposer,
	EffectPass,
	RenderPass,
} from "postprocessing";
import type React from "react";
import { useEffect, useRef } from "react";
import * as THREE from "three";
import { useWindowActive } from "@/lib/hooks/use-window-active";

type GridScanProps = {
	sensitivity?: number;

	lineThickness?: number;
	linesColor?: string;

	gridScale?: number;
	lineStyle?: "solid" | "dashed" | "dotted";
	lineJitter?: number;

	enablePost?: boolean;
	bloomIntensity?: number;
	bloomThreshold?: number;
	bloomSmoothing?: number;
	chromaticAberration?: number;
	noiseIntensity?: number;

	scanColor?: string;
	scanOpacity?: number;
	scanDirection?: "forward" | "backward" | "pingpong";
	scanSoftness?: number;
	scanGlow?: number;
	scanPhaseTaper?: number;
	scanDuration?: number;
	scanDelay?: number;
	enableGyro?: boolean;
	scanOnClick?: boolean;
	snapBackDelay?: number;
	lightMode?: boolean;

	/** Upper bound on device pixel ratio. 1.5 keeps retina crisp at ~44% of the fill cost of 2. */
	maxPixelRatio?: number;
	/** Render cap in frames per second. 0 disables the cap. */
	maxFps?: number;
	/** Stop the render loop entirely while out of view, hidden, or the window is unfocused. */
	pauseWhenHidden?: boolean;

	className?: string;
	style?: React.CSSProperties;
};

const vert = `
varying vec2 vUv;
void main(){
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`;

const frag = `
precision highp float;
uniform vec3 iResolution;
uniform float iTime;
uniform vec2 uSkew;
uniform vec2 uCorridor;
uniform float uTilt;
uniform float uYaw;
uniform float uLineThickness;
uniform vec3 uLinesColor;
uniform vec3 uScanColor;
uniform float uGridScale;
uniform float uLineStyle;
uniform float uLineJitter;
uniform float uScanOpacity;
uniform float uScanDirection;
uniform float uNoise;
uniform float uBloomOpacity;
uniform float uScanGlow;
uniform float uScanSoftness;
uniform float uPhaseTaper;
uniform float uScanDuration;
uniform float uScanDelay;
uniform float uLightMode;
varying vec2 vUv;

uniform float uScanStarts[8];
uniform float uScanCount;

const int MAX_SCANS = 8;
const float FOCAL = 2.0;

float smoother01(float a, float b, float x){
  float t = clamp((x - a) / max(1e-5, (b - a)), 0.0, 1.0);
  return t * t * t * (t * (t * 6.0 - 15.0) + 10.0);
}

void mainImage(out vec4 fragColor, in vec2 fragCoord)
{
    vec2 p = (2.0 * fragCoord - iResolution.xy) / iResolution.y;

    vec3 ro = vec3(0.0);
    vec3 rd = normalize(vec3(p, FOCAL));

    float cR = cos(uTilt), sR = sin(uTilt);
    rd.xy = mat2(cR, -sR, sR, cR) * rd.xy;

    float cY = cos(uYaw), sY = sin(uYaw);
    rd.xz = mat2(cY, -sY, sY, cY) * rd.xz;

    vec2 skew = clamp(uSkew, vec2(-0.7), vec2(0.7));
    rd.xy += skew * rd.z;

    vec3 color = vec3(0.0);
  float minT = 1e20;
  float gridScale = max(1e-5, uGridScale);
    float fadeStrength = 2.0;
    vec2 gridUV = vec2(0.0);

  float hitIsY = 1.0;
    for (int i = 0; i < 4; i++)
    {
        float isY = float(i < 2);
        float pos = mix(-uCorridor.y, uCorridor.y, float(i)) * isY + mix(-uCorridor.x, uCorridor.x, float(i - 2)) * (1.0 - isY);
        float num = pos - (isY * ro.y + (1.0 - isY) * ro.x);
        float den = isY * rd.y + (1.0 - isY) * rd.x;
        float t = num / den;
        vec3 h = ro + rd * t;

        float depthBoost = smoothstep(0.0, 3.0, h.z);
        h.xy += skew * 0.15 * depthBoost;

    bool use = t > 0.0 && t < minT;
    gridUV = use ? mix(h.zy, h.xz, isY) / gridScale : gridUV;
    minT = use ? t : minT;
    hitIsY = use ? isY : hitIsY;
    }

    vec3 hit = ro + rd * minT;
    float dist = length(hit - ro);

  float jitterAmt = clamp(uLineJitter, 0.0, 1.0);
  if (jitterAmt > 0.0) {
    vec2 j = vec2(
      sin(gridUV.y * 2.7 + iTime * 1.8),
      cos(gridUV.x * 2.3 - iTime * 1.6)
    ) * (0.15 * jitterAmt);
    gridUV += j;
  }
  float fx = fract(gridUV.x);
  float fy = fract(gridUV.y);
  float ax = min(fx, 1.0 - fx);
  float ay = min(fy, 1.0 - fy);
  float wx = fwidth(gridUV.x);
  float wy = fwidth(gridUV.y);
  float halfPx = max(0.0, uLineThickness) * 0.5;

  float tx = halfPx * wx;
  float ty = halfPx * wy;

  float aax = wx;
  float aay = wy;

  float lineX = 1.0 - smoothstep(tx, tx + aax, ax);
  float lineY = 1.0 - smoothstep(ty, ty + aay, ay);
  if (uLineStyle > 0.5) {
    float dashRepeat = 4.0;
    float dashDuty = 0.5;
    float vy = fract(gridUV.y * dashRepeat);
    float vx = fract(gridUV.x * dashRepeat);
    float dashMaskY = step(vy, dashDuty);
    float dashMaskX = step(vx, dashDuty);
    if (uLineStyle < 1.5) {
      lineX *= dashMaskY;
      lineY *= dashMaskX;
    } else {
      float dotRepeat = 6.0;
      float dotWidth = 0.18;
      float cy = abs(fract(gridUV.y * dotRepeat) - 0.5);
      float cx = abs(fract(gridUV.x * dotRepeat) - 0.5);
      float dotMaskY = 1.0 - smoothstep(dotWidth, dotWidth + fwidth(gridUV.y * dotRepeat), cy);
      float dotMaskX = 1.0 - smoothstep(dotWidth, dotWidth + fwidth(gridUV.x * dotRepeat), cx);
      lineX *= dotMaskY;
      lineY *= dotMaskX;
    }
  }
  float primaryMask = max(lineX, lineY);

  vec2 gridUV2 = (hitIsY > 0.5 ? hit.xz : hit.zy) / gridScale;
  if (jitterAmt > 0.0) {
    vec2 j2 = vec2(
      cos(gridUV2.y * 2.1 - iTime * 1.4),
      sin(gridUV2.x * 2.5 + iTime * 1.7)
    ) * (0.15 * jitterAmt);
    gridUV2 += j2;
  }
  float fx2 = fract(gridUV2.x);
  float fy2 = fract(gridUV2.y);
  float ax2 = min(fx2, 1.0 - fx2);
  float ay2 = min(fy2, 1.0 - fy2);
  float wx2 = fwidth(gridUV2.x);
  float wy2 = fwidth(gridUV2.y);
  float tx2 = halfPx * wx2;
  float ty2 = halfPx * wy2;
  float aax2 = wx2;
  float aay2 = wy2;
  float lineX2 = 1.0 - smoothstep(tx2, tx2 + aax2, ax2);
  float lineY2 = 1.0 - smoothstep(ty2, ty2 + aay2, ay2);
  if (uLineStyle > 0.5) {
    float dashRepeat2 = 4.0;
    float dashDuty2 = 0.5;
    float vy2m = fract(gridUV2.y * dashRepeat2);
    float vx2m = fract(gridUV2.x * dashRepeat2);
    float dashMaskY2 = step(vy2m, dashDuty2);
    float dashMaskX2 = step(vx2m, dashDuty2);
    if (uLineStyle < 1.5) {
      lineX2 *= dashMaskY2;
      lineY2 *= dashMaskX2;
    } else {
      float dotRepeat2 = 6.0;
      float dotWidth2 = 0.18;
      float cy2 = abs(fract(gridUV2.y * dotRepeat2) - 0.5);
      float cx2 = abs(fract(gridUV2.x * dotRepeat2) - 0.5);
      float dotMaskY2 = 1.0 - smoothstep(dotWidth2, dotWidth2 + fwidth(gridUV2.y * dotRepeat2), cy2);
      float dotMaskX2 = 1.0 - smoothstep(dotWidth2, dotWidth2 + fwidth(gridUV2.x * dotRepeat2), cx2);
      lineX2 *= dotMaskY2;
      lineY2 *= dotMaskX2;
    }
  }
    float altMask = max(lineX2, lineY2);

    float edgeDistX = min(abs(hit.x + uCorridor.x), abs(hit.x - uCorridor.x));
    float edgeDistY = min(abs(hit.y + uCorridor.y), abs(hit.y - uCorridor.y));
    float edgeDist = mix(edgeDistY, edgeDistX, hitIsY);
    float edgeGate = 1.0 - smoothstep(gridScale * 0.5, gridScale * 2.0, edgeDist);
    altMask *= edgeGate;

  float lineMask = max(primaryMask, altMask);

    float fade = exp(-dist * fadeStrength);

    float dur = max(0.05, uScanDuration);
    float del = max(0.0, uScanDelay);
    // The tunnel meets the frame border at exactly this depth, so that's where the
    // sweep has to stop. Running it all the way to z = 0 spends part of every cycle
    // behind the nearest visible grid — the sweep vanishes short of the edge and the
    // turnaround reads as a stall.
    float scanZNear = uCorridor.y * FOCAL;
    float scanZFar = 2.0;
    float widthScale = max(0.1, uScanGlow);
    float sigma = max(0.001, 0.18 * widthScale * uScanSoftness);
    float sigmaA = sigma * 2.0;

    float combinedPulse = 0.0;
    float combinedAura = 0.0;

    float cycle = dur + del;
    float tCycle = mod(iTime, cycle);
    float scanPhase = clamp((tCycle - del) / dur, 0.0, 1.0);
    float phase = scanPhase;
    if (uScanDirection > 0.5 && uScanDirection < 1.5) {
      phase = 1.0 - phase;
    } else if (uScanDirection > 1.5) {
      float t2 = mod(max(0.0, iTime - del), 2.0 * dur);
      phase = (t2 < dur) ? (t2 / dur) : (1.0 - (t2 - dur) / dur);
    }
    float scanZ = mix(scanZNear, scanZFar, phase);
    float dz = abs(hit.z - scanZ);
    float lineBand = exp(-0.5 * (dz * dz) / (sigma * sigma));
    float taper = clamp(uPhaseTaper, 0.0, 0.49);
    float headW = taper;
    float tailW = taper;
    float headFade = smoother01(0.0, headW, phase);
    float tailFade = 1.0 - smoother01(1.0 - tailW, 1.0, phase);
    float phaseWindow = headFade * tailFade;
    float pulseBase = lineBand * phaseWindow;
    combinedPulse += pulseBase * clamp(uScanOpacity, 0.0, 1.0);
    float auraBand = exp(-0.5 * (dz * dz) / (sigmaA * sigmaA));
    combinedAura += (auraBand * 0.25) * phaseWindow * clamp(uScanOpacity, 0.0, 1.0);

    for (int i = 0; i < MAX_SCANS; i++) {
      if (float(i) >= uScanCount) break;
      float tActiveI = iTime - uScanStarts[i];
      float phaseI = clamp(tActiveI / dur, 0.0, 1.0);
      if (uScanDirection > 0.5 && uScanDirection < 1.5) {
        phaseI = 1.0 - phaseI;
      } else if (uScanDirection > 1.5) {
        phaseI = (phaseI < 0.5) ? (phaseI * 2.0) : (1.0 - (phaseI - 0.5) * 2.0);
      }
      float scanZI = mix(scanZNear, scanZFar, phaseI);
      float dzI = abs(hit.z - scanZI);
      float lineBandI = exp(-0.5 * (dzI * dzI) / (sigma * sigma));
      float headFadeI = smoother01(0.0, headW, phaseI);
      float tailFadeI = 1.0 - smoother01(1.0 - tailW, 1.0, phaseI);
      float phaseWindowI = headFadeI * tailFadeI;
      combinedPulse += lineBandI * phaseWindowI * clamp(uScanOpacity, 0.0, 1.0);
      float auraBandI = exp(-0.5 * (dzI * dzI) / (sigmaA * sigmaA));
      combinedAura += (auraBandI * 0.25) * phaseWindowI * clamp(uScanOpacity, 0.0, 1.0);
    }

  float lineVis = lineMask;
  vec3 gridCol = uLinesColor * lineVis * fade;
  vec3 scanCol = uScanColor * combinedPulse;
  vec3 scanAura = uScanColor * combinedAura;

    color = gridCol + scanCol + scanAura;

  float n = fract(sin(dot(gl_FragCoord.xy + vec2(iTime * 123.4), vec2(12.9898,78.233))) * 43758.5453123);
  color += (n - 0.5) * uNoise;
  color = clamp(color, 0.0, 1.0);
  float alpha = clamp(max(lineVis, combinedPulse), 0.0, 1.0);
  float gx = 1.0 - smoothstep(tx * 2.0, tx * 2.0 + aax * 2.0, ax);
  float gy = 1.0 - smoothstep(ty * 2.0, ty * 2.0 + aay * 2.0, ay);
  float halo = max(gx, gy) * fade;
  alpha = max(alpha, halo * clamp(uBloomOpacity, 0.0, 1.0));
  if (uLightMode > 0.5) {
    float energy = max(max(color.r, color.g), color.b);
    float coverage = clamp(max(alpha, smoothstep(0.0, 0.55, energy) * 0.82), 0.0, 0.9);
    coverage *= smoothstep(0.015, 0.12, energy);
    vec3 chroma = clamp(color / max(energy, 0.0001), 0.0, 1.0);
    chroma = pow(chroma, vec3(1.2));
    fragColor = vec4(mix(vec3(1.0), chroma, coverage * 0.94), 1.0);
  } else {
    fragColor = vec4(color, alpha);
  }
}

void main(){
  vec4 c;
  mainImage(c, vUv * iResolution.xy);
  gl_FragColor = c;
}
`;

/** Half-height of the tunnel the camera sits inside; the half-width tracks the container's aspect. */
const CORRIDOR_HALF_HEIGHT = 0.2;
/** Extra margin (s) so a capped rate lands on real display frames instead of beating against them. */
const FRAME_EPSILON = 0.004;
const MAX_SCANS = 8;

type Tuning = {
	skewScale: number;
	tiltScale: number;
	yawScale: number;
	yBoost: number;
	smoothTime: number;
	frameInterval: number;
};

const computeTuning = (sensitivity: number, maxFps: number): Tuning => {
	const s = THREE.MathUtils.clamp(sensitivity, 0, 1);
	return {
		skewScale: THREE.MathUtils.lerp(0.06, 0.2, s),
		tiltScale: THREE.MathUtils.lerp(0.12, 0.3, s),
		yawScale: THREE.MathUtils.lerp(0.1, 0.28, s),
		yBoost: THREE.MathUtils.lerp(1.2, 1.6, s),
		smoothTime: THREE.MathUtils.lerp(0.45, 0.12, s),
		frameInterval: maxFps > 0 ? 1 / maxFps : 0,
	};
};

export const GridScan: React.FC<GridScanProps> = ({
	sensitivity = 0.55,
	lineThickness = 1,
	linesColor = "#2F293A",
	scanColor = "#FF9FFC",
	scanOpacity = 0.4,
	gridScale = 0.1,
	lineStyle = "solid",
	lineJitter = 0.1,
	scanDirection = "pingpong",
	enablePost = true,
	bloomIntensity = 0,
	bloomThreshold = 0,
	bloomSmoothing = 0,
	chromaticAberration = 0.002,
	noiseIntensity = 0.01,
	scanGlow = 0.5,
	scanSoftness = 2,
	scanPhaseTaper = 0.9,
	scanDuration = 2.0,
	scanDelay = 2.0,
	enableGyro = false,
	scanOnClick = false,
	snapBackDelay = 250,
	lightMode = false,
	maxPixelRatio = 1.5,
	maxFps = 30,
	pauseWhenHidden = true,
	className,
	style,
}) => {
	const windowActive = useWindowActive();
	const containerRef = useRef<HTMLDivElement | null>(null);

	const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
	const sceneRef = useRef<THREE.Scene | null>(null);
	const cameraRef = useRef<THREE.OrthographicCamera | null>(null);
	const materialRef = useRef<THREE.ShaderMaterial | null>(null);
	const composerRef = useRef<EffectComposer | null>(null);
	const bloomRef = useRef<BloomEffect | null>(null);
	const chromaRef = useRef<ChromaticAberrationEffect | null>(null);
	const rafRef = useRef<number | null>(null);
	const sizeRef = useRef({ width: 1, height: 1, dpr: 1 });
	/** Seconds of *rendered* time — frozen while paused, so the sweep never jumps. */
	const clockRef = useRef(0);
	const syncRunningRef = useRef<() => void>(() => {});

	const tuningRef = useRef(computeTuning(sensitivity, maxFps));
	const maxPixelRatioRef = useRef(maxPixelRatio);
	const pauseWhenHiddenRef = useRef(pauseWhenHidden);
	const windowActiveRef = useRef(windowActive);
	const scanDurationRef = useRef(scanDuration);

	const lookX = useRef<Channel>({ value: 0, target: 0, vel: 0 });
	const lookY = useRef<Channel>({ value: 0, target: 0, vel: 0 });
	const tilt = useRef<Channel>({ value: 0, target: 0, vel: 0 });
	const yaw = useRef<Channel>({ value: 0, target: 0, vel: 0 });

	const scanStartsRef = useRef<number[]>(new Array(MAX_SCANS).fill(0));
	const scanCountRef = useRef(0);

	const needsBloom = enablePost && bloomIntensity > 0;
	const needsChroma = enablePost && chromaticAberration > 0;

	tuningRef.current = computeTuning(sensitivity, maxFps);
	maxPixelRatioRef.current = maxPixelRatio;
	pauseWhenHiddenRef.current = pauseWhenHidden;
	windowActiveRef.current = windowActive;
	scanDurationRef.current = scanDuration;

	// Renderer, scene and the render loop — created once and kept alive for the
	// lifetime of the component. Every prop below is pushed in through uniforms,
	// so nothing here needs to rebuild the WebGL context.
	useEffect(() => {
		const container = containerRef.current;
		if (!container) return;

		const renderer = new THREE.WebGLRenderer({
			// The shader antialiases its own lines with fwidth(), so MSAA on a
			// fullscreen quad would only cost fill rate.
			antialias: false,
			alpha: true,
			depth: false,
			stencil: false,
			powerPreference: "low-power",
		});
		rendererRef.current = renderer;
		renderer.outputColorSpace = THREE.SRGBColorSpace;
		renderer.toneMapping = THREE.NoToneMapping;
		renderer.setClearColor(0x000000, 0);
		container.appendChild(renderer.domElement);

		const uniforms = {
			iResolution: { value: new THREE.Vector3(1, 1, 1) },
			iTime: { value: 0 },
			uSkew: { value: new THREE.Vector2(0, 0) },
			uCorridor: {
				value: new THREE.Vector2(CORRIDOR_HALF_HEIGHT, CORRIDOR_HALF_HEIGHT),
			},
			uTilt: { value: 0 },
			uYaw: { value: 0 },
			uLineThickness: { value: 1 },
			uLinesColor: { value: new THREE.Color() },
			uScanColor: { value: new THREE.Color() },
			uGridScale: { value: 0.1 },
			uLineStyle: { value: 0 },
			uLineJitter: { value: 0 },
			uScanOpacity: { value: 0 },
			uNoise: { value: 0 },
			uBloomOpacity: { value: 0 },
			uScanGlow: { value: 0 },
			uScanSoftness: { value: 1 },
			uPhaseTaper: { value: 0 },
			uScanDuration: { value: 1 },
			uScanDelay: { value: 0 },
			uScanDirection: { value: 0 },
			uScanStarts: { value: scanStartsRef.current },
			uScanCount: { value: 0 },
			uLightMode: { value: 0 },
		};

		const material = new THREE.ShaderMaterial({
			uniforms,
			vertexShader: vert,
			fragmentShader: frag,
			transparent: true,
			depthWrite: false,
			depthTest: false,
		});
		materialRef.current = material;

		const scene = new THREE.Scene();
		const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
		const quad = new THREE.Mesh(fullscreenTriangle(), material);
		quad.frustumCulled = false;
		scene.add(quad);
		sceneRef.current = scene;
		cameraRef.current = camera;

		const applySize = () => {
			const width = Math.max(1, Math.round(container.clientWidth));
			const height = Math.max(1, Math.round(container.clientHeight));
			const dpr = THREE.MathUtils.clamp(
				window.devicePixelRatio || 1,
				0.5,
				Math.max(0.5, maxPixelRatioRef.current),
			);
			const size = sizeRef.current;
			if (size.width === width && size.height === height && size.dpr === dpr)
				return;
			size.width = width;
			size.height = height;
			size.dpr = dpr;
			renderer.setPixelRatio(dpr);
			renderer.setSize(width, height);
			uniforms.iResolution.value.set(width, height, dpr);
			// Rays are normalised by height, so the tunnel only lines up with the
			// frame if its walls track the container's aspect — otherwise they run
			// off the sides near the camera and the grid reads as over-zoomed.
			uniforms.uCorridor.value.set(
				(CORRIDOR_HALF_HEIGHT * width) / height,
				CORRIDOR_HALF_HEIGHT,
			);
			composerRef.current?.setSize(width, height);
		};

		const resizeObserver = new ResizeObserver(applySize);
		resizeObserver.observe(container);
		// Catches display/DPR changes, which don't move the container.
		window.addEventListener("resize", applySize);
		applySize();

		let ready = false;
		let intersecting = true;
		let pageVisible = !document.hidden;
		let lastFrame = performance.now();

		const tick = (now: number) => {
			rafRef.current = requestAnimationFrame(tick);

			const tuning = tuningRef.current;
			const elapsed = (now - lastFrame) / 1000;
			if (elapsed < tuning.frameInterval - FRAME_EPSILON) return;
			lastFrame = now;

			const dt = Math.min(elapsed, 0.1);
			clockRef.current += dt;
			const time = clockRef.current;

			stepChannel(lookX.current, tuning.smoothTime, dt);
			stepChannel(lookY.current, tuning.smoothTime, dt);
			stepChannel(tilt.current, tuning.smoothTime, dt);
			stepChannel(yaw.current, tuning.smoothTime, dt);

			uniforms.uSkew.value.set(
				lookX.current.value * tuning.skewScale,
				-lookY.current.value * tuning.yBoost * tuning.skewScale,
			);
			uniforms.uTilt.value = tilt.current.value * tuning.tiltScale;
			uniforms.uYaw.value = THREE.MathUtils.clamp(
				yaw.current.value * tuning.yawScale,
				-0.6,
				0.6,
			);
			uniforms.iTime.value = time;

			// Retire finished click-scans so the shader loop goes back to zero
			// iterations once they've swept through.
			if (scanCountRef.current > 0) {
				const starts = scanStartsRef.current;
				const cutoff = time - scanDurationRef.current;
				let expired = 0;
				while (expired < scanCountRef.current && starts[expired] < cutoff)
					expired++;
				if (expired > 0) {
					starts.copyWithin(0, expired, scanCountRef.current);
					scanCountRef.current -= expired;
					uniforms.uScanCount.value = scanCountRef.current;
				}
			}

			const composer = composerRef.current;
			if (composer) composer.render(dt);
			else renderer.render(scene, camera);
		};

		const syncRunning = () => {
			const shouldRun =
				ready &&
				(!pauseWhenHiddenRef.current ||
					(intersecting && pageVisible && windowActiveRef.current));
			if (shouldRun) {
				if (rafRef.current === null) {
					// Back-date by one interval so resuming draws on the next frame
					// rather than sitting blank through a full cap period.
					lastFrame =
						performance.now() - tuningRef.current.frameInterval * 1000;
					rafRef.current = requestAnimationFrame(tick);
				}
			} else if (rafRef.current !== null) {
				cancelAnimationFrame(rafRef.current);
				rafRef.current = null;
			}
		};
		syncRunningRef.current = syncRunning;

		const intersectionObserver = new IntersectionObserver(
			(entries) => {
				intersecting = entries[entries.length - 1]?.isIntersecting ?? true;
				syncRunning();
			},
			{ threshold: 0 },
		);
		intersectionObserver.observe(container);

		const onVisibility = () => {
			pageVisible = !document.hidden;
			syncRunning();
		};
		document.addEventListener("visibilitychange", onVisibility);

		let disposed = false;
		const begin = () => {
			if (disposed) return;
			ready = true;
			syncRunning();
		};
		// Links the shader off the main thread where the driver supports it, so
		// the first frame doesn't stall the step transition.
		try {
			renderer.compileAsync(scene, camera).then(begin, begin);
		} catch {
			begin();
		}

		return () => {
			disposed = true;
			if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
			rafRef.current = null;
			syncRunningRef.current = () => {};
			resizeObserver.disconnect();
			intersectionObserver.disconnect();
			window.removeEventListener("resize", applySize);
			document.removeEventListener("visibilitychange", onVisibility);
			// Ahead of the renderer, so the composer's targets are released while
			// the context is still alive.
			const composer = composerRef.current;
			if (composer) {
				composerRef.current = null;
				bloomRef.current = null;
				chromaRef.current = null;
				composer.dispose();
			}
			material.dispose();
			quad.geometry.dispose();
			renderer.dispose();
			renderer.forceContextLoss();
			renderer.domElement.remove();
			materialRef.current = null;
			sceneRef.current = null;
			cameraRef.current = null;
			rendererRef.current = null;
		};
	}, []);

	// Post-processing chain. Only built when an effect would actually be visible,
	// and rebuilt only when one is switched on or off — never on value tweaks.
	useEffect(() => {
		const renderer = rendererRef.current;
		const scene = sceneRef.current;
		const camera = cameraRef.current;
		if (!renderer || !scene || !camera) return;
		if (!needsBloom && !needsChroma) return;

		const composer = new EffectComposer(renderer);
		composer.addPass(new RenderPass(scene, camera));

		const effects: (BloomEffect | ChromaticAberrationEffect)[] = [];
		if (needsBloom) {
			const bloom = new BloomEffect({
				intensity: 1.0,
				luminanceThreshold: 0,
				luminanceSmoothing: 0,
			});
			bloomRef.current = bloom;
			effects.push(bloom);
		}
		if (needsChroma) {
			const chroma = new ChromaticAberrationEffect({
				offset: new THREE.Vector2(0, 0),
				radialModulation: true,
				modulationOffset: 0.0,
			});
			chromaRef.current = chroma;
			effects.push(chroma);
		}

		const effectPass = new EffectPass(camera, ...effects);
		effectPass.renderToScreen = true;
		composer.addPass(effectPass);
		composer.setSize(sizeRef.current.width, sizeRef.current.height);
		composerRef.current = composer;

		return () => {
			// Skipped on unmount, where the renderer effect already tore this down.
			if (composerRef.current !== composer) return;
			composerRef.current = null;
			bloomRef.current = null;
			chromaRef.current = null;
			composer.dispose();
		};
	}, [needsBloom, needsChroma]);

	// Single place where props reach the GPU.
	useEffect(() => {
		const material = materialRef.current;
		if (material) {
			const u = material.uniforms;
			u.uLineThickness.value = lineThickness;
			(u.uLinesColor.value as THREE.Color)
				.set(linesColor)
				.convertSRGBToLinear();
			(u.uScanColor.value as THREE.Color).set(scanColor).convertSRGBToLinear();
			u.uGridScale.value = gridScale;
			u.uLineStyle.value =
				lineStyle === "dashed" ? 1 : lineStyle === "dotted" ? 2 : 0;
			u.uLineJitter.value = THREE.MathUtils.clamp(lineJitter || 0, 0, 1);
			u.uBloomOpacity.value = Math.max(0, bloomIntensity);
			u.uNoise.value = Math.max(0, noiseIntensity);
			u.uScanGlow.value = scanGlow;
			u.uScanOpacity.value = THREE.MathUtils.clamp(scanOpacity, 0, 1);
			u.uScanDirection.value =
				scanDirection === "backward" ? 1 : scanDirection === "pingpong" ? 2 : 0;
			u.uScanSoftness.value = scanSoftness;
			u.uPhaseTaper.value = scanPhaseTaper;
			u.uScanDuration.value = Math.max(0.05, scanDuration);
			u.uScanDelay.value = Math.max(0.0, scanDelay);
			u.uLightMode.value = lightMode ? 1 : 0;
		}
		if (bloomRef.current) {
			bloomRef.current.blendMode.opacity.value = Math.max(0, bloomIntensity);
			bloomRef.current.luminanceMaterial.threshold = bloomThreshold;
			bloomRef.current.luminanceMaterial.smoothing = bloomSmoothing;
		}
		chromaRef.current?.offset.set(chromaticAberration, chromaticAberration);
	}, [
		lineThickness,
		linesColor,
		scanColor,
		gridScale,
		lineStyle,
		lineJitter,
		bloomIntensity,
		bloomThreshold,
		bloomSmoothing,
		chromaticAberration,
		noiseIntensity,
		scanGlow,
		scanOpacity,
		scanDirection,
		scanSoftness,
		scanPhaseTaper,
		scanDuration,
		scanDelay,
		lightMode,
	]);

	useEffect(() => {
		syncRunningRef.current();
	}, [pauseWhenHidden, windowActive]);

	useEffect(() => {
		const el = containerRef.current;
		if (!el) return;

		let leaveTimer: number | null = null;
		const clearLeaveTimer = () => {
			if (leaveTimer !== null) {
				clearTimeout(leaveTimer);
				leaveTimer = null;
			}
		};

		const onMove = (e: MouseEvent) => {
			clearLeaveTimer();
			const rect = el.getBoundingClientRect();
			lookX.current.target = ((e.clientX - rect.left) / rect.width) * 2 - 1;
			lookY.current.target = -(((e.clientY - rect.top) / rect.height) * 2 - 1);
		};
		const onLeave = () => {
			clearLeaveTimer();
			leaveTimer = window.setTimeout(
				() => {
					lookX.current.target = 0;
					lookY.current.target = 0;
					tilt.current.target = 0;
					yaw.current.target = 0;
				},
				Math.max(0, snapBackDelay || 0),
			);
		};
		const onClick = async () => {
			if (scanOnClick) {
				const starts = scanStartsRef.current;
				if (scanCountRef.current >= MAX_SCANS) {
					starts.copyWithin(0, 1);
					starts[MAX_SCANS - 1] = clockRef.current;
				} else {
					starts[scanCountRef.current++] = clockRef.current;
				}
				const u = materialRef.current?.uniforms;
				if (u) u.uScanCount.value = scanCountRef.current;
			}
			const orientation = window.DeviceOrientationEvent as
				| DeviceOrientationEventWithPermission
				| undefined;
			if (enableGyro && orientation?.requestPermission) {
				try {
					await orientation.requestPermission();
				} catch {}
			}
		};

		el.addEventListener("mousemove", onMove);
		el.addEventListener("mouseenter", clearLeaveTimer);
		el.addEventListener("mouseleave", onLeave);
		if (scanOnClick || enableGyro) el.addEventListener("click", onClick);
		return () => {
			el.removeEventListener("mousemove", onMove);
			el.removeEventListener("mouseenter", clearLeaveTimer);
			el.removeEventListener("mouseleave", onLeave);
			if (scanOnClick || enableGyro) el.removeEventListener("click", onClick);
			clearLeaveTimer();
		};
	}, [snapBackDelay, scanOnClick, enableGyro]);

	useEffect(() => {
		if (!enableGyro) return;
		const handler = (e: DeviceOrientationEvent) => {
			const gamma = e.gamma ?? 0;
			const beta = e.beta ?? 0;
			lookX.current.target = THREE.MathUtils.clamp(gamma / 45, -1, 1);
			lookY.current.target = THREE.MathUtils.clamp(-beta / 30, -1, 1);
			tilt.current.target = THREE.MathUtils.degToRad(gamma) * 0.4;
		};
		window.addEventListener("deviceorientation", handler);
		return () => {
			window.removeEventListener("deviceorientation", handler);
		};
	}, [enableGyro]);

	return (
		<div
			ref={containerRef}
			className={`relative h-full w-full overflow-hidden ${className ?? ""}`}
			style={style}
		/>
	);
};

type DeviceOrientationEventWithPermission = typeof DeviceOrientationEvent & {
	requestPermission?: () => Promise<PermissionState>;
};

type Channel = { value: number; target: number; vel: number };

/**
 * Unity-style SmoothDamp, in place and allocation-free (the old Vector2 variant
 * cloned half a dozen vectors per channel per frame).
 */
function stepChannel(channel: Channel, smoothTime: number, dt: number) {
	const time = Math.max(0.0001, smoothTime);
	const omega = 2 / time;
	const x = omega * dt;
	const exp = 1 / (1 + x + 0.48 * x * x + 0.235 * x * x * x);

	const goal = channel.target;
	const change = channel.value - goal;
	const temp = (channel.vel + omega * change) * dt;
	channel.vel = (channel.vel - omega * temp) * exp;

	let out = goal + (change + temp) * exp;
	if ((goal - channel.value) * (out - goal) > 0) {
		out = goal;
		channel.vel = 0;
	}
	channel.value = out;
}

/**
 * One oversized triangle instead of a quad: two fewer vertices, no index buffer
 * and no normals, and it still maps uv 0..1 across the viewport.
 */
function fullscreenTriangle() {
	const geometry = new THREE.BufferGeometry();
	geometry.setAttribute(
		"position",
		new THREE.BufferAttribute(
			new Float32Array([-1, -1, 0, 3, -1, 0, -1, 3, 0]),
			3,
		),
	);
	geometry.setAttribute(
		"uv",
		new THREE.BufferAttribute(new Float32Array([0, 0, 2, 0, 0, 2]), 2),
	);
	return geometry;
}
