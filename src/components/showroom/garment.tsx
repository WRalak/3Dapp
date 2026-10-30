"use client";

import { Component, Suspense, useEffect, useLayoutEffect, useMemo, type ReactNode } from "react";
import * as THREE from "three";
import { useThree } from "@react-three/fiber";
import { useGLTF } from "@react-three/drei";
import { KTX2Loader, type GLTFLoader } from "three-stdlib";
import { GARMENT_DEPTH, GARMENT_PROFILES, GARMENT_Y_OFFSET } from "@/features/showroom/garment-profiles";
import type { GarmentKindName, Model3DData } from "@/types/catalog";

/** Self-hosted decoders (no third-party CDN, CSP friendly). Draco decodes in Web Workers. */
export const DRACO_PATH = "/vendor/draco/";
const BASIS_PATH = "/vendor/basis/";
const TARGET_HEIGHT = 1.42;

// ── Shared, lazily created GPU resources (one per process, reused by every garment) ─────

const geometryCache = new Map<string, THREE.BufferGeometry>();
const materialCache = new Map<string, THREE.MeshPhysicalMaterial>();
let weaveTexture: THREE.DataTexture | null = null;
let ktx2: KTX2Loader | null = null;

/** Tiny procedural normal map that gives the fabric a woven micro-texture. */
function getWeaveTexture() {
  if (weaveTexture) return weaveTexture;
  const size = 32;
  const data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;
      const warp = Math.sin((x / size) * Math.PI * 8);
      const weft = Math.sin((y / size) * Math.PI * 8);
      const over = (Math.floor(x / 4) + Math.floor(y / 4)) % 2 === 0;
      data[i] = 128 + (over ? warp : 0) * 40;
      data[i + 1] = 128 + (over ? 0 : weft) * 40;
      data[i + 2] = 255;
      data[i + 3] = 255;
    }
  }
  weaveTexture = new THREE.DataTexture(data, size, size);
  weaveTexture.wrapS = weaveTexture.wrapT = THREE.RepeatWrapping;
  weaveTexture.repeat.set(10, 14);
  weaveTexture.needsUpdate = true;
  return weaveTexture;
}

export function fabricMaterial(hex: string) {
  const cached = materialCache.get(hex);
  if (cached) return cached;
  const color = new THREE.Color(hex);
  // Dark cloth needs a brighter sheen to read as fabric rather than a flat silhouette.
  const luminance = color.r * 0.2126 + color.g * 0.7152 + color.b * 0.0722;
  const mat = new THREE.MeshPhysicalMaterial({
    color,
    roughness: 0.82,
    metalness: 0,
    sheen: 1,
    sheenRoughness: 0.6,
    sheenColor: color.clone().lerp(new THREE.Color("#ffffff"), luminance < 0.08 ? 0.55 : 0.35),
    normalMap: getWeaveTexture(),
    normalScale: new THREE.Vector2(0.35, 0.35),
    side: THREE.DoubleSide,
  });
  materialCache.set(hex, mat);
  return mat;
}

function proceduralGeometry(kind: GarmentKindName, segments: number) {
  const key = `${kind}:${segments}`;
  const cached = geometryCache.get(key);
  if (cached) return cached;
  let geo: THREE.BufferGeometry;
  if (kind === "SHOES") {
    geo = new THREE.CapsuleGeometry(0.12, 0.3, 6, segments / 2).rotateZ(Math.PI / 2).scale(1, 0.55, 0.6).translate(0, -0.5, 0);
  } else if (kind === "BAG" || kind === "ACCESSORY") {
    geo = new THREE.BoxGeometry(0.5, 0.4, 0.16, 2, 2, 1).translate(0, -0.3, 0);
  } else {
    const profile = GARMENT_PROFILES[kind] ?? GARMENT_PROFILES.TOP!;
    // LatheGeometry wants bottom→top ordering.
    const pts = [...profile].reverse().map(([r, y]) => new THREE.Vector2(r, y + GARMENT_Y_OFFSET));
    geo = new THREE.LatheGeometry(pts, segments).scale(1, 1, GARMENT_DEPTH);
  }
  geo.computeVertexNormals();
  geometryCache.set(key, geo);
  return geo;
}

export function ProceduralGarment({ kind, color, segments = 32 }: { kind: GarmentKindName; color: string; segments?: number }) {
  const geometry = useMemo(() => proceduralGeometry(kind, segments), [kind, segments]);
  return <mesh geometry={geometry} material={fabricMaterial(color)} castShadow />;
}

// ── GLB/GLTF models ─────────────────────────────────────────────────────────

function useLoaderExtension() {
  const gl = useThree((s) => s.gl);
  return useMemo(
    () => (loader: GLTFLoader) => {
      ktx2 ??= new KTX2Loader().setTranscoderPath(BASIS_PATH).detectSupport(gl);
      loader.setKTX2Loader(ktx2);
    },
    [gl],
  );
}

/** Normalises arbitrary models to the rail's scale and hanging point. */
function LoadedModel({ model }: { model: Model3DData }) {
  const extend = useLoaderExtension();
  const gltf = useGLTF(model.url, DRACO_PATH, true, extend);
  const scene = useMemo(() => gltf.scene.clone(true), [gltf.scene]);

  useLayoutEffect(() => {
    const box = new THREE.Box3().setFromObject(scene);
    const size = box.getSize(new THREE.Vector3());
    const scale = size.y > 0 ? TARGET_HEIGHT / size.y : 1;
    scene.scale.setScalar(scale);
    const center = box.getCenter(new THREE.Vector3());
    // Hang from the top: top of the model sits at the hanger's shoulder line.
    scene.position.set(-center.x * scale, -box.max.y * scale + 0.6, -center.z * scale);
    scene.traverse((o) => {
      if ((o as THREE.Mesh).isMesh) {
        o.castShadow = true;
      }
    });
  }, [scene]);

  // Free GPU memory when the model leaves the load window.
  useEffect(
    () => () => {
      gltf.scene.traverse((o) => {
        const mesh = o as THREE.Mesh;
        if (!mesh.isMesh) return;
        mesh.geometry?.dispose();
        const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
        for (const m of mats) {
          for (const v of Object.values(m)) if (v instanceof THREE.Texture) v.dispose();
          m.dispose();
        }
      });
      useGLTF.clear(model.url);
    },
    [gltf, model.url],
  );

  return <primitive object={scene} />;
}

class ModelErrorBoundary extends Component<{ fallback: ReactNode; children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(error: unknown) {
    console.warn("3D model failed to load; using procedural fallback", error);
  }
  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

/**
 * Renders a product's real model when it exists and is allowed to load, otherwise a
 * procedural garment. Loading and failure states both fall back gracefully.
 */
export function Garment({ model, kind, color, loadModel, segments }: { model: Model3DData | null; kind: GarmentKindName; color: string; loadModel: boolean; segments?: number }) {
  const fallback = <ProceduralGarment kind={kind} color={color} segments={segments} />;
  if (!model || !loadModel) return fallback;
  return (
    <ModelErrorBoundary fallback={fallback}>
      <Suspense fallback={fallback}>
        <LoadedModel model={model} />
      </Suspense>
    </ModelErrorBoundary>
  );
}

export function preloadModel(url: string) {
  useGLTF.preload(url, DRACO_PATH, true);
}
