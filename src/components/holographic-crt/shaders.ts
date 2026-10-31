/**
 * Holographic CRT Shaders
 *
 * Retro-futuristic holographic CRT effect combining iridescent color shifting,
 * scanlines, chromatic aberration, digital glitch artifacts, vertex displacement,
 * CRT static noise, flicker, bloom/edge glow, UV vignette, and semi-transparent
 * holographic alpha. Designed to be applied directly to 3D object materials.
 */

export const vertexShader = /* glsl */ `
  varying vec2 vUv;
  varying vec3 vNormal;
  varying vec3 vWorldPosition;
  varying vec3 vViewDirection;

  void main() {
    vUv = uv;

    // View-space normal via normalMatrix
    vNormal = normalize(normalMatrix * normal);

    // World position for view direction computation
    vec4 worldPos = modelMatrix * vec4(position, 1.0);
    vWorldPosition = worldPos.xyz;
    vViewDirection = normalize(cameraPosition - worldPos.xyz);

    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

export const fragmentShader = /* glsl */ `
  uniform float uTime;
  uniform vec3 uBaseColor;
  uniform float uScanlineIntensity;
  uniform float uScanlineCount;
  uniform float uChromaticStrength;
  uniform float uGlitchIntensity;
  uniform float uBloomStrength;
  uniform float uFlickerSpeed;
  uniform float uOpacity;

  varying vec2 vUv;
  varying vec3 vNormal;
  varying vec3 vWorldPosition;
  varying vec3 vViewDirection;

  // --- Hash functions (classic sin-fract approach) ---
  float hash(float n) {
    return fract(sin(n) * 43758.5453123);
  }

  float hash2(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
  }

  // --- Value noise via hash interpolation ---
  float noise(float x) {
    float i = floor(x);
    float f = fract(x);
    float a = hash(i);
    float b = hash(i + 1.0);
    return mix(a, b, f * f * (3.0 - 2.0 * f));
  }

  float noise2(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    float a = hash2(i);
    float b = hash2(i + vec2(1.0, 0.0));
    float c = hash2(i + vec2(0.0, 1.0));
    float d = hash2(i + vec2(1.0, 1.0));
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
  }

  void main() {
    vec3 normal = normalize(vNormal);
    vec3 viewDir = normalize(vViewDirection);

    // --- Fresnel ---
    float fresnel = 1.0 - abs(dot(normal, viewDir));
    fresnel = pow(fresnel, 2.0);

    // --- Holographic iridescence ---
    float holo = dot(normal, viewDir) * 2.0 + vWorldPosition.y * 3.0 + uTime * 0.5;
    vec3 holoColor = vec3(
      sin(holo),
      sin(holo + 2.094),
      sin(holo + 4.189)
    ) * 0.5 + 0.5;

    // Blend holographic color with base color — keep base dominant
    vec3 color = mix(uBaseColor, holoColor, 0.08 + fresnel * 0.12);

    // --- Chromatic aberration ---
    float chromaticOffset = uChromaticStrength * 0.05;
    float fresnelR = 1.0 - abs(dot(normal, viewDir) + chromaticOffset);
    float fresnelG = 1.0 - abs(dot(normal, viewDir));
    float fresnelB = 1.0 - abs(dot(normal, viewDir) - chromaticOffset);
    fresnelR = pow(clamp(fresnelR, 0.0, 1.0), 2.0);
    fresnelG = pow(clamp(fresnelG, 0.0, 1.0), 2.0);
    fresnelB = pow(clamp(fresnelB, 0.0, 1.0), 2.0);

    // Apply chromatic split to the color — subtle so base color holds
    color.r *= 1.0 + (fresnelR - fresnel) * 0.6;
    color.g *= 1.0 + (fresnelG - fresnel) * 0.6;
    color.b *= 1.0 + (fresnelB - fresnel) * 0.6;

    // --- Scanlines (screen-space) ---
    float scanlinePrimary = sin(gl_FragCoord.y * uScanlineCount * 0.1) * 0.5 + 0.5;
    float scanlineSecondary = sin(gl_FragCoord.y * uScanlineCount * 0.5) * 0.5 + 0.5;

    // Combine: primary thick scanlines + fine secondary
    float scanlineMask = 1.0 - uScanlineIntensity * (
      (1.0 - scanlinePrimary) * 0.6 +
      (1.0 - scanlineSecondary) * 0.4
    );

    color *= scanlineMask;

    // --- Digital glitch artifacts ---
    float glitchTime = floor(uTime * 12.0);

    // Darker shade of the base color for glitch tinting
    vec3 glitchTint = uBaseColor * 0.35;

    // Use world-space Y for glitch bands — works on all models even without UVs
    float worldY = vWorldPosition.y;

    // Color shift in 20 horizontal bands — push toward dark base instead of yellow
    float bandY = floor(worldY * 20.0);
    float bandHash = hash(bandY * 3.17 + glitchTime * 1.43);
    if (bandHash > 1.0 - uGlitchIntensity * 0.4) {
      float shift = (hash(bandY * 7.31 + glitchTime) - 0.5) * 0.15 * uGlitchIntensity;
      color = mix(color, glitchTint + shift, uGlitchIntensity * 0.5);
    }

    // Flash lines in 80 fine bands — tinted with darker base color
    float flashBandY = floor(worldY * 80.0);
    float flashHash = hash(flashBandY * 11.13 + glitchTime * 2.57);
    if (flashHash > 1.0 - uGlitchIntensity * 0.15) {
      color += glitchTint * uGlitchIntensity;
    }

    // Channel swap in 8 coarse bands — darken instead of swapping to yellow
    float swapBandY = floor(worldY * 8.0);
    float swapHash = hash(swapBandY * 5.91 + glitchTime * 4.13);
    if (swapHash > 1.0 - uGlitchIntensity * 0.2) {
      color = mix(color, glitchTint, 0.6);
    }

    // --- CRT static noise ---
    float staticNoise = noise2(vWorldPosition.xy * 300.0 + uTime * 100.0);
    color += (staticNoise - 0.5) * 0.06; // ±0.03

    // --- Flicker ---
    float flicker = 1.0
      + sin(uTime * uFlickerSpeed) * 0.02
      + sin(uTime * uFlickerSpeed * 0.7) * 0.015;
    color *= flicker;

    // --- Bloom / edge glow ---
    vec3 bloomColor = fresnel * (uBaseColor * 1.5 + vec3(0.2, 0.4, 0.8)) * uBloomStrength;
    color += bloomColor;

    // --- Vignette (view-space) ---
    // Use fresnel as vignette since world position is more reliable than UVs
    float vignette = smoothstep(0.0, 1.0, 1.0 - fresnel * 0.8);
    color = mix(color, color * vignette, 0.3);

    // --- Final alpha (semi-transparent holographic) ---
    float alpha = mix(0.4, 1.0, fresnel) * uOpacity * scanlineMask;

    gl_FragColor = vec4(color, alpha);
  }
`;
