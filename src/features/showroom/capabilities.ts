/**
 * Device capability detection for adaptive 3D quality. Pure logic is separated from the
 * browser probe so it can be unit-tested.
 */
export type QualityTier = "low" | "mid" | "high";

export interface DeviceSignals {
  webgl: boolean;
  webgl2: boolean;
  renderer: string;
  cores: number;
  memoryGb: number | null;
  isTouch: boolean;
  screenWidth: number;
  devicePixelRatio: number;
  reducedMotion: boolean;
  saveData: boolean;
}

export interface Capabilities {
  webgl: boolean;
  tier: QualityTier;
  dpr: [number, number];
  loadRadius: number;
  shadows: boolean;
  segments: number;
  isTouch: boolean;
  reducedMotion: boolean;
}

const WEAK_GPU = /(mali-4|mali-t[0-9]{3}|adreno \(tm\) [2-4]\d\d|powervr sgx|intel\(r\) hd graphics [2-4]\d{3}|swiftshader|llvmpipe|software)/i;
const STRONG_GPU = /(apple m\d|apple gpu|rtx|radeon pro|radeon rx|geforce gtx 1[06-9]|adreno \(tm\) [67]\d\d|mali-g7[1-9]|mali-g[89]\d|iris xe)/i;

export function classify(s: DeviceSignals): Capabilities {
  if (!s.webgl) {
    return { webgl: false, tier: "low", dpr: [1, 1], loadRadius: 0, shadows: false, segments: 16, isTouch: s.isTouch, reducedMotion: s.reducedMotion };
  }
  let score = 0;
  if (s.webgl2) score += 1;
  if (s.cores >= 8) score += 2;
  else if (s.cores >= 6) score += 1;
  if (s.memoryGb != null) score += s.memoryGb >= 8 ? 2 : s.memoryGb >= 4 ? 1 : -1;
  if (STRONG_GPU.test(s.renderer)) score += 2;
  if (WEAK_GPU.test(s.renderer)) score -= 3;
  if (s.isTouch && s.screenWidth < 768) score -= 1;
  if (s.saveData) score -= 2;

  const tier: QualityTier = score >= 4 ? "high" : score >= 1 ? "mid" : "low";
  const maxDpr = Math.min(s.devicePixelRatio || 1, tier === "high" ? 2 : tier === "mid" ? 1.5 : 1.25);
  return {
    webgl: true,
    tier,
    dpr: [1, Math.max(1, maxDpr)],
    loadRadius: tier === "high" ? 3 : tier === "mid" ? 2 : 1,
    shadows: tier !== "low",
    segments: tier === "high" ? 48 : tier === "mid" ? 32 : 20,
    isTouch: s.isTouch,
    reducedMotion: s.reducedMotion,
  };
}

/** Browser probe — creates (and immediately releases) a throwaway WebGL context. */
export function probeDevice(): DeviceSignals {
  const nav = navigator as Navigator & { deviceMemory?: number; connection?: { saveData?: boolean } };
  let webgl = false;
  let webgl2 = false;
  let renderer = "";
  try {
    const canvas = document.createElement("canvas");
    const gl2 = canvas.getContext("webgl2");
    const gl = (gl2 ?? canvas.getContext("webgl") ?? canvas.getContext("experimental-webgl")) as WebGLRenderingContext | null;
    webgl = !!gl;
    webgl2 = !!gl2;
    if (gl) {
      const info = gl.getExtension("WEBGL_debug_renderer_info");
      renderer = info ? String(gl.getParameter(info.UNMASKED_RENDERER_WEBGL)) : String(gl.getParameter(gl.RENDERER));
      gl.getExtension("WEBGL_lose_context")?.loseContext();
    }
  } catch {
    webgl = false;
  }
  return {
    webgl,
    webgl2,
    renderer,
    cores: nav.hardwareConcurrency ?? 4,
    memoryGb: nav.deviceMemory ?? null,
    isTouch: "ontouchstart" in window || nav.maxTouchPoints > 0,
    screenWidth: window.screen?.width ?? window.innerWidth,
    devicePixelRatio: window.devicePixelRatio ?? 1,
    reducedMotion: window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false,
    saveData: !!nav.connection?.saveData,
  };
}
