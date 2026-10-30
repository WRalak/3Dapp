"use client";

import { create } from "zustand";

/**
 * Showroom interaction state. High-frequency values (offset, velocity, drag deltas) are
 * read with getState() inside useFrame so they never trigger React re-renders; only
 * discrete changes (selection, order, focus) are subscribed to by components.
 */
export const RAIL_SPACING = 0.82;
export const ZOOM_MIN = 0.7;
export const ZOOM_MAX = 4;
export const ZOOM_DEFAULT = 3.1;

interface ShowroomState {
  order: string[];
  selectedId: string | null;
  focusIndex: number;
  hoveredId: string | null;

  // continuous (not subscribed)
  offset: number;
  offsetTarget: number;
  velocity: number;
  dragging: boolean;
  dragItem: { id: string; dx: number } | null;
  pressedId: string | null;
  unitsPerPx: number;
  yaw: number;
  pitch: number;
  zoom: number;

  setOrder: (ids: string[]) => void;
  select: (id: string | null) => void;
  setFocusIndex: (i: number) => void;
  setHovered: (id: string | null) => void;
  scrollTo: (index: number) => void;
  moveItem: (id: string, toIndex: number) => void;
  rotateBy: (dYaw: number, dPitch?: number) => void;
  setView: (view: "front" | "side" | "back") => void;
  zoomBy: (delta: number) => void;
  reset: () => void;
}

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

export const useShowroomStore = create<ShowroomState>((set, get) => ({
  order: [],
  selectedId: null,
  focusIndex: 0,
  hoveredId: null,
  offset: 0,
  offsetTarget: 0,
  velocity: 0,
  dragging: false,
  dragItem: null,
  pressedId: null,
  unitsPerPx: 0.005,
  yaw: 0,
  pitch: 0,
  zoom: ZOOM_DEFAULT,

  setOrder: (order) => set({ order }),
  select: (id) => set({ selectedId: id, yaw: 0, pitch: 0, zoom: ZOOM_DEFAULT, velocity: 0 }),
  setFocusIndex: (focusIndex) => set({ focusIndex }),
  setHovered: (hoveredId) => set({ hoveredId }),
  scrollTo: (index) => {
    const i = clamp(index, 0, Math.max(0, get().order.length - 1));
    set({ offsetTarget: i * RAIL_SPACING, velocity: 0, focusIndex: i });
  },
  moveItem: (id, toIndex) => {
    const order = get().order.filter((x) => x !== id);
    order.splice(clamp(toIndex, 0, order.length), 0, id);
    set({ order });
  },
  rotateBy: (dYaw, dPitch = 0) => set((s) => ({ yaw: s.yaw + dYaw, pitch: clamp(s.pitch + dPitch, -0.6, 0.6) })),
  setView: (view) => set((s) => {
    const base = view === "front" ? 0 : view === "side" ? Math.PI / 2 : Math.PI;
    // rotate the shortest way from the current yaw
    const turns = Math.round((s.yaw - base) / (Math.PI * 2));
    return { yaw: base + turns * Math.PI * 2, pitch: 0 };
  }),
  zoomBy: (delta) => set((s) => ({ zoom: clamp(s.zoom + delta, ZOOM_MIN, ZOOM_MAX) })),
  reset: () => set({ selectedId: null, yaw: 0, pitch: 0, zoom: ZOOM_DEFAULT }),
}));
