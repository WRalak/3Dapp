"use client";

import { useEffect, useMemo, useState } from "react";
import { classify, probeDevice, type Capabilities } from "@/features/showroom/capabilities";
import { useLite } from "@/i18n/client";

/**
 * Probes the device once. Callers are client-only (loaded with `ssr: false`), so probing in
 * the initializer is safe; on the server it returns null.
 */
export function useDeviceCapability(forceFallback = false): Capabilities | null {
  // Lite mode (or the browser's data-saver) never downloads 3D models: the 2D gallery is used.
  const lite = useLite();
  const saveData = typeof navigator !== "undefined" && !!(navigator as Navigator & { connection?: { saveData?: boolean } }).connection?.saveData;
  forceFallback = forceFallback || lite || saveData;
  const [probed] = useState<Capabilities | null>(() => (typeof window === "undefined" ? null : classify(probeDevice())));
  const [reducedMotion, setReducedMotion] = useState<boolean | null>(null);
  useEffect(() => {
    const mq = window.matchMedia?.("(prefers-reduced-motion: reduce)");
    const onChange = () => setReducedMotion(mq.matches);
    mq?.addEventListener?.("change", onChange);
    return () => mq?.removeEventListener?.("change", onChange);
  }, []);
  return useMemo(
    () => (probed ? { ...probed, webgl: forceFallback ? false : probed.webgl, reducedMotion: reducedMotion ?? probed.reducedMotion } : null),
    [probed, forceFallback, reducedMotion],
  );
}

/** Pauses rendering when the element is off-screen or the tab is hidden. */
export function useInView(ref: React.RefObject<HTMLElement | null>) {
  const [visible, setVisible] = useState(true);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let onScreen = true;
    const update = () => setVisible(onScreen && document.visibilityState === "visible");
    const io = new IntersectionObserver(([entry]) => {
      onScreen = !!entry?.isIntersecting;
      update();
    });
    io.observe(el);
    document.addEventListener("visibilitychange", update);
    return () => {
      io.disconnect();
      document.removeEventListener("visibilitychange", update);
    };
  }, [ref]);
  return visible;
}
