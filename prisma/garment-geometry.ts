import { Document, NodeIO } from "@gltf-transform/core";

/**
 * Procedurally builds a lathe-style garment silhouette (dress / coat / top) as a real GLB,
 * so development data exercises the same GLTF loading path as production assets.
 */
type Profile = [radius: number, y: number][];

export const PROFILES: Record<string, Profile> = {
  DRESS: [
    [0.02, 1.5], [0.12, 1.49], [0.16, 1.44], [0.17, 1.36], [0.15, 1.24], [0.13, 1.1], [0.16, 1.0], [0.22, 0.8], [0.3, 0.55], [0.38, 0.3], [0.42, 0.18],
  ],
  COAT: [
    [0.03, 1.52], [0.14, 1.5], [0.22, 1.44], [0.23, 1.3], [0.21, 1.1], [0.2, 0.95], [0.22, 0.7], [0.25, 0.45], [0.27, 0.3],
  ],
  JACKET: [
    [0.03, 1.5], [0.14, 1.49], [0.22, 1.43], [0.22, 1.28], [0.2, 1.1], [0.19, 0.95], [0.2, 0.85],
  ],
  TOP: [
    [0.03, 1.5], [0.12, 1.49], [0.19, 1.44], [0.19, 1.3], [0.17, 1.15], [0.18, 1.0], [0.19, 0.92],
  ],
  KNIT: [
    [0.04, 1.5], [0.13, 1.49], [0.21, 1.42], [0.22, 1.28], [0.21, 1.1], [0.2, 0.98], [0.18, 0.9],
  ],
  SKIRT: [
    [0.13, 1.05], [0.15, 1.0], [0.2, 0.8], [0.27, 0.6], [0.32, 0.45],
  ],
  TROUSERS: [
    [0.15, 1.05], [0.17, 0.95], [0.16, 0.75], [0.14, 0.5], [0.12, 0.25], [0.11, 0.1],
  ],
};

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
      const z = Math.sin(a) * radius * 0.62;
      positions.push(x, y - 0.9, z);
      const len = Math.hypot(Math.cos(a), Math.sin(a) / 0.62) || 1;
      normals.push(Math.cos(a) / len, 0, Math.sin(a) / 0.62 / len);
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
