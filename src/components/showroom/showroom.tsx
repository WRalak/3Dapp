"use client";

import { Component, Suspense, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Canvas } from "@react-three/fiber";
import { PerformanceMonitor } from "@react-three/drei";
import { AnimatePresence, motion } from "framer-motion";
import { ChevronLeft, ChevronRight, Hand } from "lucide-react";
import { useDeviceCapability, useInView } from "@/hooks/use-device-capability";
import { RAIL_SPACING, useShowroomStore } from "@/stores/showroom-store";
import { Price } from "@/components/ui/misc";
import type { ShowroomItem } from "@/types/catalog";
import { RailScene } from "./rail-scene";
import { InspectOverlay } from "./inspect-panel";
import { FallbackGallery } from "./fallback-gallery";

class CanvasErrorBoundary extends Component<{ fallback: ReactNode; children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(error: unknown) {
    console.warn("Showroom WebGL failed; switching to 2D gallery", error);
  }
  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

/**
 * Pointer/touch gestures for the rail, implemented on the DOM container so mouse, pen and
 * touch share one code path:
 *   • drag empty space / swipe → scroll the rail with inertia
 *   • drag a garment sideways  → slide it along the rail and re-hang it in a new slot
 *   • tap a garment            → lift it into the inspection pose
 *   • while inspecting: drag → rotate (360° yaw, limited pitch), wheel/pinch → zoom
 */
function useRailGestures(enabled: boolean) {
  const gesture = useRef<{ id: number; x: number; y: number; lastX: number; lastT: number; mode: "pending" | "scroll" | "item" | "rotate"; pressed: string | null } | null>(null);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const pinch = useRef<number | null>(null);

  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (!enabled || e.button > 0) return;
      pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
      // R3F's raycast handler on the canvas runs first and records which garment was hit.
      const pressed = useShowroomStore.getState().pressedId;
      useShowroomStore.setState({ pressedId: null });
      if (pointers.current.size === 2) {
        const [a, b] = [...pointers.current.values()];
        pinch.current = Math.hypot(a!.x - b!.x, a!.y - b!.y);
        gesture.current = null;
        return;
      }
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
      gesture.current = { id: e.pointerId, x: e.clientX, y: e.clientY, lastX: e.clientX, lastT: performance.now(), mode: "pending", pressed };
    },
    [enabled],
  );

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    if (pointers.current.has(e.pointerId)) pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const s = useShowroomStore.getState();
    if (pinch.current != null && pointers.current.size === 2 && s.selectedId) {
      const [a, b] = [...pointers.current.values()];
      const d = Math.hypot(a!.x - b!.x, a!.y - b!.y);
      s.zoomBy((pinch.current - d) * 0.006);
      pinch.current = d;
      return;
    }
    const g = gesture.current;
    if (!g || g.id !== e.pointerId) return;
    const dx = e.clientX - g.x;
    const dy = e.clientY - g.y;
    if (g.mode === "pending") {
      if (Math.hypot(dx, dy) < 6) return;
      if (s.selectedId) g.mode = "rotate";
      else if (Math.abs(dy) > Math.abs(dx) * 1.2 && e.pointerType === "touch") {
        gesture.current = null; // vertical swipe → let the page scroll
        return;
      } else if (g.pressed) g.mode = "item";
      else g.mode = "scroll";
      useShowroomStore.setState({ dragging: g.mode === "scroll" });
    }
    const stepX = e.clientX - g.lastX;
    const now = performance.now();
    const dt = Math.max(1, now - g.lastT);
    if (g.mode === "scroll") {
      const move = -stepX * s.unitsPerPx;
      useShowroomStore.setState({ offsetTarget: s.offsetTarget + move, velocity: (move / dt) * 16 });
    } else if (g.mode === "item" && g.pressed) {
      useShowroomStore.setState({ dragItem: { id: g.pressed, dx: dx * s.unitsPerPx }, velocity: (-stepX * s.unitsPerPx * 16) / dt });
    } else if (g.mode === "rotate") {
      s.rotateBy(stepX * 0.012, (e.movementY || 0) * 0.004);
    }
    g.lastX = e.clientX;
    g.lastT = now;
  }, []);

  const onPointerUp = useCallback((e: React.PointerEvent) => {
    pointers.current.delete(e.pointerId);
    if (pointers.current.size < 2) pinch.current = null;
    const g = gesture.current;
    gesture.current = null;
    if (!g || g.id !== e.pointerId) return;
    const s = useShowroomStore.getState();
    if (g.mode === "pending" && g.pressed && !s.selectedId) {
      s.select(g.pressed);
      s.scrollTo(s.order.indexOf(g.pressed));
      void fetch("/api/analytics", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ type: "SHOWROOM_INSPECT", productId: g.pressed }) });
    } else if (g.mode === "item" && s.dragItem) {
      const from = s.order.indexOf(s.dragItem.id);
      const to = Math.round((from * RAIL_SPACING + s.dragItem.dx) / RAIL_SPACING);
      s.moveItem(s.dragItem.id, to);
      useShowroomStore.setState({ dragItem: null, velocity: 0 });
    }
    useShowroomStore.setState({ dragging: false });
  }, []);

  const onWheel = useCallback((e: React.WheelEvent) => {
    const s = useShowroomStore.getState();
    if (s.selectedId) {
      s.zoomBy(e.deltaY * 0.0025);
      return;
    }
    // Only hijack horizontal intent (trackpads / shift+wheel) so vertical page scroll still works.
    const horizontal = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.shiftKey ? e.deltaY : 0;
    if (horizontal) useShowroomStore.setState({ offsetTarget: s.offsetTarget + horizontal * s.unitsPerPx, velocity: 0 });
  }, []);

  return { onPointerDown, onPointerMove, onPointerUp, onPointerCancel: onPointerUp, onWheel };
}

export function Showroom({ items, currency, height = "h-[calc(100dvh-16rem)] min-h-[480px] max-h-[900px]", compact = false, forceFallback = false }: { items: ShowroomItem[]; currency: string; height?: string; compact?: boolean; forceFallback?: boolean }) {
  const caps = useDeviceCapability(forceFallback);
  const container = useRef<HTMLDivElement>(null);
  const visible = useInView(container);
  const [dprOverride, setDpr] = useState<number | null>(null);
  const dpr = dprOverride ?? caps?.dpr[1] ?? 1;
  const order = useShowroomStore((s) => s.order);
  const focusIndex = useShowroomStore((s) => s.focusIndex);
  const selectedId = useShowroomStore((s) => s.selectedId);
  const byId = useMemo(() => new Map(items.map((i) => [i.id, i])), [items]);
  const gestures = useRailGestures(!!caps?.webgl);

  useEffect(() => {
    useShowroomStore.setState({ order: items.map((i) => i.id), selectedId: null, offset: 0, offsetTarget: 0, velocity: 0, focusIndex: 0 });
  }, [items]);

  // Keyboard: ←/→ browse, Enter inspect, Esc return.
  const onKeyDown = (e: React.KeyboardEvent) => {
    const s = useShowroomStore.getState();
    if (e.key === "ArrowRight" && !s.selectedId) s.scrollTo(s.focusIndex + 1);
    else if (e.key === "ArrowLeft" && !s.selectedId) s.scrollTo(s.focusIndex - 1);
    else if (e.key === "ArrowRight" && s.selectedId) s.rotateBy(Math.PI / 8);
    else if (e.key === "ArrowLeft" && s.selectedId) s.rotateBy(-Math.PI / 8);
    else if (e.key === "Enter" && !s.selectedId && s.order[s.focusIndex]) s.select(s.order[s.focusIndex]!);
    else if (e.key === "Escape" && s.selectedId) s.reset();
    else if ((e.key === "+" || e.key === "=") && s.selectedId) s.zoomBy(-0.3);
    else if (e.key === "-" && s.selectedId) s.zoomBy(0.3);
    else return;
    e.preventDefault();
  };

  if (!caps) return <div className={`${height} skeleton w-full`} aria-label="Loading showroom" />;
  if (!caps.webgl || items.length === 0) return <FallbackGallery items={items} currency={currency} />;

  const focused = byId.get(order[focusIndex] ?? "");
  const selected = selectedId ? byId.get(selectedId) ?? null : null;

  return (
    <CanvasErrorBoundary fallback={<FallbackGallery items={items} currency={currency} />}>
      <div className={`relative w-full overflow-hidden bg-[#efebe4] ${height}`}>
        <div
          ref={container}
          className="absolute inset-0 outline-none focus-visible:ring-2 focus-visible:ring-ink"
          style={{ touchAction: selected ? "none" : "pan-y" }}
          tabIndex={0}
          role="application"
          aria-roledescription="3D clothing rail"
          aria-label="Clothing rail. Use left and right arrow keys to browse, Enter to inspect, Escape to return."
          onKeyDown={onKeyDown}
          {...gestures}
        >
          <Canvas
            dpr={dpr}
            frameloop={visible ? "always" : "never"}
            camera={{ fov: 35, near: 0.1, far: 40, position: [0, 0.08, 6] }}
            gl={{ antialias: caps.tier !== "low", powerPreference: "high-performance", alpha: false, stencil: false }}
            onCreated={({ gl }) => {
              gl.toneMappingExposure = 1.05;
            }}
          >
            <PerformanceMonitor
              bounds={() => [45, 58]}
              onDecline={() => setDpr(Math.max(1, Math.round((dpr - 0.25) * 100) / 100))}
              onIncline={() => setDpr(Math.min(caps.dpr[1], Math.round((dpr + 0.25) * 100) / 100))}
              flipflops={3}
              onFallback={() => setDpr(1)}
            />
            <Suspense fallback={null}>
              <RailScene items={items} caps={caps} />
            </Suspense>
          </Canvas>
        </div>

        {/* Screen-reader & keyboard accessible list of the rail */}
        <ul className="sr-only">
          {order.map((id, i) => {
            const it = byId.get(id);
            return it ? (
              <li key={id}>
                <button type="button" onClick={() => (useShowroomStore.getState().scrollTo(i), useShowroomStore.getState().select(id))}>
                  Inspect {it.name} by {it.brand}
                </button>
              </li>
            ) : null;
          })}
        </ul>

        <AnimatePresence>
          {!selected && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="pointer-events-none absolute inset-x-0 bottom-0 flex items-end justify-between gap-4 p-4 md:p-8">
              <div className="pointer-events-auto max-w-[60%]">
                {focused && (
                  <button type="button" className="text-left" onClick={() => useShowroomStore.getState().select(focused.id)}>
                    <p className="eyebrow text-taupe">{focused.brand}</p>
                    <p className="mt-1 text-lg font-medium tracking-tight md:text-2xl">{focused.name}</p>
                    <Price cents={focused.priceCents} compareAt={focused.compareAtCents} currency={currency} className="text-sm text-graphite" />
                  </button>
                )}
              </div>
              <div className="pointer-events-auto flex items-center gap-2">
                <button type="button" aria-label="Previous garment" onClick={() => useShowroomStore.getState().scrollTo(focusIndex - 1)} className="flex size-11 items-center justify-center border border-ink/20 bg-ivory/80 hover:bg-ivory">
                  <ChevronLeft className="size-4" />
                </button>
                <span className="w-14 text-center text-xs tabular-nums text-graphite">
                  {focusIndex + 1} / {order.length}
                </span>
                <button type="button" aria-label="Next garment" onClick={() => useShowroomStore.getState().scrollTo(focusIndex + 1)} className="flex size-11 items-center justify-center border border-ink/20 bg-ivory/80 hover:bg-ivory">
                  <ChevronRight className="size-4" />
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {!selected && !compact && (
          <p className="pointer-events-none absolute left-1/2 top-5 flex -translate-x-1/2 items-center gap-2 bg-ivory/80 px-3 py-1.5 text-[11px] uppercase tracking-[0.16em] text-graphite">
            <Hand className="size-3.5" aria-hidden /> {caps.isTouch ? "Swipe to browse · tap to inspect" : "Drag to browse · click to inspect"}
          </p>
        )}

        <AnimatePresence>{selected && <InspectOverlay key={selected.id} item={selected} currency={currency} compact={compact} />}</AnimatePresence>
      </div>
    </CanvasErrorBoundary>
  );
}
