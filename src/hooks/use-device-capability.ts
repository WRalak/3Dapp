"use client";

import { useEffect, useState } from "react";
import { classify, probeDevice, type Capabilities } from "@/features/showroom/capabilities";

/** Returns null until probed on the client (avoids SSR/hydration mismatch). */
export function useDeviceCapability(forceFallback = false): Capabilities | null {
  const [caps, setCaps] = useState<Capabilities | null>(null);
  useEffect(() => {
    const probed = classify(probeDevice());
    setCaps(forceFallback ? { ...probed, webgl: false } : probed);
    const mq = window.matchMedia?.("(prefers-reduced-motion: reduce)");
    const onChange = () => setCaps((c) => (c ? { ...c, reducedMotion: mq.matches } : c));
    mq?.addEventListener?.("change", onChange);
    return () => mq?.removeEventListener?.("change", onChange);
  }, [forceFallback]);
  return caps;
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
