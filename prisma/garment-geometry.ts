import { Document, NodeIO } from "@gltf-transform/core";
import { GARMENT_DEPTH, GARMENT_PROFILES as PROFILES, GARMENT_Y_OFFSET } from "../src/features/showroom/garment-profiles";

/**
 * Procedurally builds a lathe-style garment silhouette (dress / coat / top) as a real GLB,
 * so development data exercises the same GLTF loading path as production assets.
 */
export function buildGarmentGlb(kind: string, hex: string, segments = 48): Promise<Uint8Array> {
  const profile = PROFILES[kind] ?? PROFILES.TOP!;
  const rows = profile.length;
  const positions: number[] = [];
  const normals: number[] = [];
  const indices: number[] = [];

  for (let r = 0; r < rows; r++) {
    const [radius, y] = profile[r]!;
    // Flatten the body front-to-back so it reads as a garment rather than a vase.
    for (let s = 0; s <= segments; s++) {
      const a = (s / segments) * Math.PI * 2;
      const x = Math.cos(a) * radius;
      const z = Math.sin(a) * radius * GARMENT_DEPTH;
      positions.push(x, y + GARMENT_Y_OFFSET, z);
      const len = Math.hypot(Math.cos(a), Math.sin(a) / GARMENT_DEPTH) || 1;
      normals.push(Math.cos(a) / len, 0, Math.sin(a) / GARMENT_DEPTH / len);
    }
  }
  for (let r = 0; r < rows - 1; r++) {
    for (let s = 0; s < segments; s++) {
      const a = r * (segments + 1) + s;
      const b = a + segments + 1;
      indices.push(a, b, a + 1, b, b + 1, a + 1);
    }
  }

  const doc = new Document();
  const buffer = doc.createBuffer();
  const pos = doc.createAccessor().setType("VEC3").setArray(new Float32Array(positions)).setBuffer(buffer);
  const nor = doc.createAccessor().setType("VEC3").setArray(new Float32Array(normals)).setBuffer(buffer);
  const idx = doc.createAccessor().setType("SCALAR").setArray(new Uint16Array(indices)).setBuffer(buffer);

  const n = parseInt(hex.replace("#", ""), 16);
  const srgb = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((c) => {
    const v = c / 255;
    return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  });
  const material = doc
    .createMaterial("fabric")
    .setBaseColorFactor([srgb[0]!, srgb[1]!, srgb[2]!, 1])
    .setRoughnessFactor(0.85)
    .setMetallicFactor(0)
    .setDoubleSided(true);
  const prim = doc.createPrimitive().setAttribute("POSITION", pos).setAttribute("NORMAL", nor).setIndices(idx).setMaterial(material);
  const mesh = doc.createMesh(kind.toLowerCase()).addPrimitive(prim);
  const node = doc.createNode("garment").setMesh(mesh);
  doc.createScene("scene").addChild(node);
  return new NodeIO().writeBinary(doc);
}
