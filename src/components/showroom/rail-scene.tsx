"use client";

import { memo, useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { useFrame, useThree } from "@react-three/fiber";
import { ContactShadows, createInstances, Environment, Lightformer } from "@react-three/drei";
import { RAIL_SPACING, useShowroomStore } from "@/stores/showroom-store";
import type { Capabilities } from "@/features/showroom/capabilities";
import type { ShowroomItem } from "@/types/catalog";
import { Garment, preloadModel } from "./garment";

const RAIL_Y = 0.78;
const FOV = 35;
const damp = THREE.MathUtils.damp;

// Separate instancing contexts for the two hanger parts.
const [HookInstances, Hook] = createInstances();
const [BarInstances, Bar] = createInstances();

/** Fits the camera so ~2 items are visible on phones and ~5–6 on desktop. */
function CameraRig() {
  const { camera, size } = useThree();
  const cam = camera as THREE.PerspectiveCamera;
  useEffect(() => {
    const aspect = size.width / size.height;
    const visibleItems = aspect < 0.8 ? 2.4 : aspect < 1.3 ? 4 : 6.4;
    const halfTan = Math.tan(THREE.MathUtils.degToRad(FOV / 2));
    const byWidth = (visibleItems * RAIL_SPACING) / (2 * halfTan * aspect);
    // keep rail (y≈0.8) and floor (y≈-1.03) in frame with breathing room
    const byHeight = 2.55 / (2 * halfTan);
    const distance = THREE.MathUtils.clamp(Math.max(byWidth, byHeight), 3.2, 9);
    // eslint-disable-next-line react-hooks/immutability -- three.js cameras are mutated imperatively by design
    cam.fov = FOV;
    cam.position.set(0, 0.02, distance);
    cam.lookAt(0, -0.1, 0);
    cam.updateProjectionMatrix();
    // world units per screen pixel at the rail plane — used to convert drags.
    const visibleWidth = 2 * halfTan * distance * aspect;
    useShowroomStore.setState({ unitsPerPx: visibleWidth / size.width });
  }, [cam, size.width, size.height]);
  return null;
}

/** Inertial scroll, elastic bounds and focus tracking. */
function RailPhysics({ count, reducedMotion }: { count: number; reducedMotion: boolean }) {
  const lastFocus = useRef(-1);
  useFrame((_, delta) => {
    const s = useShowroomStore.getState();
    const max = Math.max(0, (count - 1) * RAIL_SPACING);
    let target = s.offsetTarget;
    let velocity = s.velocity;
    if (!s.dragging) {
      target += velocity;
      velocity *= Math.pow(0.0025, delta); // frame-rate independent friction
      if (Math.abs(velocity) < 0.0004) velocity = 0;
      // elastic edges, then gentle snap to the nearest garment when nearly at rest
      if (target < 0) target = damp(target, 0, 10, delta);
      else if (target > max) target = damp(target, max, 10, delta);
      else if (velocity === 0) target = damp(target, Math.round(target / RAIL_SPACING) * RAIL_SPACING, 4, delta);
    }
    const offset = reducedMotion ? target : damp(s.offset, target, 9, delta);
    const focus = Math.round(THREE.MathUtils.clamp(offset / RAIL_SPACING, 0, count - 1));
    useShowroomStore.setState({ offsetTarget: target, velocity, offset });
    if (focus !== lastFocus.current) {
      lastFocus.current = focus;
      s.setFocusIndex(focus);
    }
  });
  return null;
}

function RailBar({ count }: { count: number }) {
  const ref = useRef<THREE.Group>(null);
  const length = Math.max(6, count * RAIL_SPACING + 4);
  useFrame(() => {
    if (ref.current) ref.current.position.x = -useShowroomStore.getState().offset + ((count - 1) * RAIL_SPACING) / 2;
  });
  return (
    <group ref={ref}>
      <mesh position={[0, RAIL_Y, 0]} rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[0.012, 0.012, length, 16]} />
        <meshStandardMaterial color="#2a2825" metalness={0.85} roughness={0.25} />
      </mesh>
      {[-1, 1].map((side) => (
        <mesh key={side} position={[(side * length) / 2, RAIL_Y / 2 - 0.62, 0]}>
          <cylinderGeometry args={[0.012, 0.012, RAIL_Y + 1.25, 12]} />
          <meshStandardMaterial color="#2a2825" metalness={0.85} roughness={0.25} />
        </mesh>
      ))}
    </group>
  );
}

interface ItemProps {
  item: ShowroomItem;
  caps: Capabilities;
  loadModel: boolean;
}

/**
 * One garment on the rail. Position, sway and the rail→inspection transition are all driven
 * imperatively in useFrame (no per-frame React renders). Sway is a damped pendulum excited by
 * rail acceleration and pointer hover.
 */
const RailItem = memo(function RailItem({ item, caps, loadModel }: ItemProps) {
  const group = useRef<THREE.Group>(null);
  const pivot = useRef<THREE.Group>(null);
  const hookRef = useRef<THREE.Object3D>(null);
  const barRef = useRef<THREE.Object3D>(null);
  const sway = useRef({ angle: 0, vel: 0, lastRailVel: 0 });
  const { camera, size } = useThree();

  useFrame((_, rawDelta) => {
    const delta = Math.min(rawDelta, 1 / 20);
    const s = useShowroomStore.getState();
    const g = group.current;
    const p = pivot.current;
    if (!g || !p) return;
    const slot = s.order.indexOf(item.id);
    const selected = s.selectedId === item.id;
    const someoneSelected = !!s.selectedId;
    const dragging = s.dragItem?.id === item.id;

    let tx = slot * RAIL_SPACING - s.offset + (dragging ? s.dragItem!.dx : 0);
    let ty = s.hoveredId === item.id && !someoneSelected ? 0.03 : 0;
    let tz = someoneSelected && !selected ? -0.9 : dragging ? 0.18 : 0;
    let tScale = 1;
    let yawTarget = 0;
    let pitchTarget = 0;
    if (selected) {
      // Centre the garment in the space not covered by the detail panel
      // (400px panel on the right on desktop, bottom sheet on mobile).
      const halfTan = Math.tan(THREE.MathUtils.degToRad(FOV / 2));
      const planeH = 2 * halfTan * s.zoom;
      const planeW = planeH * (size.width / size.height);
      const desktop = size.width >= 768;
      tx = desktop ? -(200 / size.width) * planeW : 0;
      ty = desktop ? 0.04 : 0.04 - planeH * 0.2;
      tz = camera.position.z - s.zoom;
      yawTarget = s.yaw;
      pitchTarget = s.pitch;
      tScale = 1;
    }
    const speed = caps.reducedMotion ? 60 : selected || someoneSelected ? 6 : dragging ? 20 : 12;
    g.position.x = damp(g.position.x, tx, speed, delta);
    g.position.y = damp(g.position.y, ty, speed, delta);
    g.position.z = damp(g.position.z, tz, caps.reducedMotion ? 60 : 5, delta);
    g.scale.setScalar(damp(g.scale.x, tScale, 6, delta));
    p.rotation.y = damp(p.rotation.y, yawTarget, caps.reducedMotion ? 60 : 7, delta);
    p.rotation.x = damp(p.rotation.x, pitchTarget, 7, delta);

    // Damped pendulum sway (disabled for reduced motion and while inspecting).
    const sw = sway.current;
    if (!caps.reducedMotion && !selected) {
      const railAccel = (s.velocity - sw.lastRailVel) / Math.max(delta, 1e-3);
      sw.lastRailVel = s.velocity;
      const hoverKick = s.hoveredId === item.id ? 0.4 : 0;
      const dragKick = dragging ? -s.velocity * 30 : 0;
      const force = -28 * sw.angle - 3.2 * sw.vel + railAccel * 2.2 + hoverKick * Math.sin(performance.now() / 220) * 0.5 + dragKick;
      sw.vel += force * delta;
      sw.angle = THREE.MathUtils.clamp(sw.angle + sw.vel * delta, -0.35, 0.35);
    } else {
      sw.angle = damp(sw.angle, 0, 8, delta);
      sw.vel = 0;
    }
    g.rotation.z = sw.angle;

    // Keep instanced hanger parts glued to the garment.
    for (const ref of [hookRef, barRef]) {
      const o = ref.current;
      if (!o) continue;
      o.position.copy(g.position);
      // Hangers stay on the rail visually only while the garment hangs there.
      if (selected) o.position.y = -100;
      o.rotation.z = sw.angle;
      o.scale.setScalar(g.scale.x);
    }
  });

  const s = useShowroomStore;
  return (
    <>
      <group
        ref={group}
        onPointerDown={(e) => {
          e.stopPropagation();
          s.setState({ pressedId: item.id });
        }}
        onPointerOver={(e) => {
          e.stopPropagation();
          s.getState().setHovered(item.id);
          document.body.style.cursor = "grab";
        }}
        onPointerOut={() => {
          if (s.getState().hoveredId === item.id) s.getState().setHovered(null);
          document.body.style.cursor = "";
        }}
      >
        {/* Invisible full-height hit area: short pieces (tops, jackets) are as easy to tap as gowns. */}
        <mesh position={[0, -0.12, 0.05]}>
          <planeGeometry args={[RAIL_SPACING * 0.8, 1.45]} />
          <meshBasicMaterial transparent opacity={0} depthWrite={false} colorWrite={false} />
        </mesh>
        {/* pivot at the hanger hook so the garment swings and rotates naturally */}
        <group position={[0, RAIL_Y, 0]}>
          <group ref={pivot}>
            <group position={[0, -RAIL_Y, 0]}>
              <Garment model={item.model} kind={item.garmentKind} color={item.primaryColor} loadModel={loadModel} segments={caps.segments} />
            </group>
          </group>
        </group>
      </group>
      <Hook ref={hookRef as never} />
      <Bar ref={barRef as never} />
    </>
  );
});

/** Hangers rendered as two instanced meshes → 2 draw calls regardless of rail length. */
function useHangerGeometry(kind: "hook" | "bar") {
  const geometry = useMemo(() => {
    if (kind === "hook") return new THREE.TorusGeometry(0.035, 0.005, 6, 16, Math.PI * 1.4).rotateZ(-Math.PI * 0.2).translate(0, RAIL_Y, 0);
    const curve = new THREE.QuadraticBezierCurve3(new THREE.Vector3(-0.21, 0.6, 0), new THREE.Vector3(0, 0.74, 0), new THREE.Vector3(0.21, 0.6, 0));
    return new THREE.TubeGeometry(curve, 16, 0.007, 6, false);
  }, [kind]);
  useEffect(() => () => geometry.dispose(), [geometry]);
  return geometry;
}

function Hangers({ children }: { children: React.ReactNode }) {
  const hook = useHangerGeometry("hook");
  const bar = useHangerGeometry("bar");
  return (
    <HookInstances limit={64} geometry={hook}>
      <meshStandardMaterial color="#8a8277" metalness={0.9} roughness={0.3} />
      <BarInstances limit={64} geometry={bar}>
        <meshStandardMaterial color="#c9b79c" metalness={0.1} roughness={0.6} />
        {children}
      </BarInstances>
    </HookInstances>
  );
}

export function RailScene({ items, caps }: { items: ShowroomItem[]; caps: Capabilities }) {
  const focusIndex = useShowroomStore((s) => s.focusIndex);
  const order = useShowroomStore((s) => s.order);
  const selectedId = useShowroomStore((s) => s.selectedId);
  const byId = useMemo(() => new Map(items.map((i) => [i.id, i])), [items]);

  // Load window: only garments near the focus (plus the selected one) fetch their GLB.
  const loaded = useMemo(() => {
    const window = new Set<string>();
    order.forEach((id, slot) => {
      if (Math.abs(slot - focusIndex) <= caps.loadRadius) window.add(id);
    });
    if (selectedId) window.add(selectedId);
    return window;
  }, [order, focusIndex, selectedId, caps.loadRadius]);

  useEffect(() => {
    // Warm the cache one step beyond the window in the direction of travel.
    const ahead = order[focusIndex + caps.loadRadius + 1];
    const model = ahead ? byId.get(ahead)?.model : null;
    if (model && caps.tier !== "low") preloadModel(model.url);
  }, [focusIndex, order, caps.loadRadius, caps.tier, byId]);

  return (
    <>
      <CameraRig />
      <RailPhysics count={items.length} reducedMotion={caps.reducedMotion} />
      <color attach="background" args={["#efebe4"]} />
      <fog attach="fog" args={["#efebe4", 9, 20]} />
      <hemisphereLight args={["#ffffff", "#d9cfc1", 0.9]} />
      <directionalLight position={[2.5, 4, 3]} intensity={2.2} />
      <directionalLight position={[-3, 2, 2]} intensity={0.6} color="#f3e6d3" />
      <Environment resolution={caps.tier === "high" ? 256 : 64} frames={1}>
        <Lightformer intensity={2} position={[0, 3, 2]} scale={[6, 1, 1]} />
        <Lightformer intensity={0.8} position={[-4, 1, 1]} rotation-y={Math.PI / 2} scale={[4, 2, 1]} />
        <Lightformer intensity={0.6} position={[4, 0, -1]} rotation-y={-Math.PI / 2} scale={[4, 2, 1]} color="#f3e6d3" />
      </Environment>

      <RailBar count={items.length} />
      <Hangers>
        {order.map((id) => {
          const item = byId.get(id);
          return item ? <RailItem key={id} item={item} caps={caps} loadModel={loaded.has(id)} /> : null;
        })}
      </Hangers>

      {caps.shadows && <ContactShadows position={[0, -1.02, 0]} opacity={0.32} scale={14} blur={2.6} far={2} frames={1} resolution={caps.tier === "high" ? 512 : 256} />}
      <mesh position={[0, -1.03, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[60, 30]} />
        <meshStandardMaterial color="#e6e0d6" roughness={1} />
      </mesh>
    </>
  );
}
