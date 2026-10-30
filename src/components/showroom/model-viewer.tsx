"use client";

import { Component, Suspense, useEffect, useRef, type ReactNode } from "react";
import * as THREE from "three";
import { Canvas, useFrame } from "@react-three/fiber";
import { ContactShadows, Environment, Lightformer } from "@react-three/drei";
import { useDeviceCapability, useInView } from "@/hooks/use-device-capability";
import { useShowroomStore, ZOOM_DEFAULT } from "@/stores/showroom-store";
import type { GarmentKindName, Model3DData } from "@/types/catalog";
import { Garment } from "./garment";
import { InspectControls } from "./inspect-panel";

class ViewerBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? <p className="flex h-full items-center justify-center p-6 text-center text-sm text-taupe">3D preview isn&apos;t available on this device.</p> : this.props.children;
  }
}

function Turntable({ model, kind, color, segments }: { model: Model3DData | null; kind: GarmentKindName; color: string; segments: number }) {
  const ref = useRef<THREE.Group>(null);
  useFrame((state, delta) => {
    const s = useShowroomStore.getState();
    const g = ref.current;
    if (!g) return;
    g.rotation.y = THREE.MathUtils.damp(g.rotation.y, s.yaw, 7, delta);
    g.rotation.x = THREE.MathUtils.damp(g.rotation.x, s.pitch, 7, delta);
    state.camera.position.z = THREE.MathUtils.damp(state.camera.position.z, s.zoom, 6, delta);
  });
  return (
    <group ref={ref} position={[0, 0.02, 0]}>
      <Garment model={model} kind={kind} color={color} loadModel segments={segments} />
    </group>
  );
}

/** Single-product 3D inspector used on product pages (rotate, zoom, preset views). */
export function ModelViewer({ model, garmentKind, color, label }: { model: Model3DData | null; garmentKind: GarmentKindName; color: string; label: string }) {
  const caps = useDeviceCapability();
  const ref = useRef<HTMLDivElement>(null);
  const visible = useInView(ref);
  const drag = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => {
    useShowroomStore.setState({ yaw: 0, pitch: 0, zoom: ZOOM_DEFAULT });
  }, [model?.url]);

  if (!caps) return <div className="skeleton absolute inset-0" />;
  if (!caps.webgl) return <p className="flex h-full items-center justify-center p-6 text-center text-sm text-taupe">3D preview needs WebGL, which isn&apos;t available on this device.</p>;

  return (
    <div
      ref={ref}
      className="absolute inset-0 cursor-grab touch-none active:cursor-grabbing"
      role="img"
      aria-label={`Interactive 3D view of ${label}. Drag to rotate, scroll to zoom.`}
      onPointerDown={(e) => {
        (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
        drag.current = { x: e.clientX, y: e.clientY };
      }}
      onPointerMove={(e) => {
        if (!drag.current) return;
        useShowroomStore.getState().rotateBy((e.clientX - drag.current.x) * 0.012, (e.clientY - drag.current.y) * 0.004);
        drag.current = { x: e.clientX, y: e.clientY };
      }}
      onPointerUp={() => (drag.current = null)}
      onWheel={(e) => useShowroomStore.getState().zoomBy(e.deltaY * 0.002)}
    >
      <ViewerBoundary>
        <Canvas dpr={caps.dpr} frameloop={visible ? "always" : "never"} camera={{ fov: 35, position: [0, 0, ZOOM_DEFAULT] }} gl={{ antialias: true, alpha: false }}>
          <color attach="background" args={["#efebe4"]} />
          <ambientLight intensity={0.4} />
          <directionalLight position={[2, 3, 3]} intensity={1.5} />
          <Environment resolution={64} frames={1}>
            <Lightformer intensity={2} position={[0, 3, 2]} scale={[6, 1, 1]} />
            <Lightformer intensity={0.7} position={[-3, 1, 1]} rotation-y={Math.PI / 2} scale={[4, 2, 1]} />
          </Environment>
          <Suspense fallback={null}>
            <Turntable model={model} kind={garmentKind} color={color} segments={caps.segments} />
          </Suspense>
          <ContactShadows position={[0, -0.85, 0]} opacity={0.3} scale={4} blur={2.4} far={1.5} frames={1} />
        </Canvas>
      </ViewerBoundary>
      <div className="absolute left-3 top-3" onPointerDown={(e) => e.stopPropagation()}>
        <InspectControls />
      </div>
    </div>
  );
}
