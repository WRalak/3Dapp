/**
 * Static glTF 2.0 / GLB inspector. Parses the container *as data only* — nothing in the
 * file is executed — and reports structure, optimisation status and mobile compatibility.
 * Pure function so it is unit-testable and safe to run in workers.
 */

export const SUPPORTED_EXTENSIONS = new Set([
  "KHR_draco_mesh_compression",
  "KHR_texture_basisu",
  "EXT_meshopt_compression",
  "KHR_mesh_quantization",
  "KHR_texture_transform",
  "KHR_materials_clearcoat",
  "KHR_materials_sheen",
  "KHR_materials_transmission",
  "KHR_materials_specular",
  "KHR_materials_ior",
  "KHR_materials_volume",
  "KHR_materials_emissive_strength",
  "KHR_materials_unlit",
  "KHR_materials_variants",
  "EXT_texture_webp",
]);

export const LIMITS = {
  maxBytes: 40 * 1024 * 1024,
  warnBytes: 12 * 1024 * 1024,
  maxTriangles: 500_000,
  warnTriangles: 120_000,
  warnTextures: 8,
};

export interface Issue {
  level: "error" | "warning" | "info";
  message: string;
}

export interface GltfReport {
  valid: boolean;
  format: "glb" | "gltf";
  byteLength: number;
  meshCount: number;
  primitiveCount: number;
  triangleCount: number;
  materialCount: number;
  textureCount: number;
  textures: { name: string; mimeType: string; bytes: number | null }[];
  extensionsUsed: string[];
  hasDraco: boolean;
  hasKtx2: boolean;
  hasMeshopt: boolean;
  boundingBox: { min: [number, number, number]; max: [number, number, number] } | null;
  issues: Issue[];
  score: number;
}

interface GltfJson {
  asset?: { version?: string };
  extensionsUsed?: string[];
  extensionsRequired?: string[];
  meshes?: { primitives: { attributes: Record<string, number>; indices?: number; mode?: number }[] }[];
  accessors?: { count: number; min?: number[]; max?: number[] }[];
  materials?: unknown[];
  textures?: unknown[];
  images?: { uri?: string; mimeType?: string; bufferView?: number; name?: string }[];
  bufferViews?: { byteLength: number }[];
  buffers?: { uri?: string; byteLength: number }[];
}

const GLB_MAGIC = 0x46546c67; // "glTF"
const CHUNK_JSON = 0x4e4f534a;

function fail(byteLength: number, format: "glb" | "gltf", message: string): GltfReport {
  return {
    valid: false,
    format,
    byteLength,
    meshCount: 0,
    primitiveCount: 0,
    triangleCount: 0,
    materialCount: 0,
    textureCount: 0,
    textures: [],
    extensionsUsed: [],
    hasDraco: false,
    hasKtx2: false,
    hasMeshopt: false,
    boundingBox: null,
    issues: [{ level: "error", message }],
    score: 0,
  };
}

export function detectFormat(buf: Uint8Array): "glb" | "gltf" | null {
  if (buf.length >= 12 && new DataView(buf.buffer, buf.byteOffset, buf.byteLength).getUint32(0, true) === GLB_MAGIC) return "glb";
  const head = new TextDecoder().decode(buf.subarray(0, Math.min(buf.length, 512))).trimStart();
  if (head.startsWith("{") && head.includes('"asset"')) return "gltf";
  return null;
}

function parseGlbJson(buf: Uint8Array): GltfJson {
  const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  const version = view.getUint32(4, true);
  const length = view.getUint32(8, true);
  if (version !== 2) throw new Error(`Unsupported GLB version ${version}`);
  if (length !== buf.byteLength) throw new Error("GLB length header does not match file size");
  const chunkLength = view.getUint32(12, true);
  const chunkType = view.getUint32(16, true);
  if (chunkType !== CHUNK_JSON) throw new Error("First GLB chunk must be JSON");
  if (20 + chunkLength > buf.byteLength) throw new Error("Truncated GLB JSON chunk");
  return JSON.parse(new TextDecoder().decode(buf.subarray(20, 20 + chunkLength))) as GltfJson;
}

export function inspectGltf(input: Uint8Array): GltfReport {
  const format = detectFormat(input);
  if (!format) return fail(input.byteLength, "glb", "Not a glTF 2.0 / GLB file");
  let json: GltfJson;
  try {
    json = format === "glb" ? parseGlbJson(input) : (JSON.parse(new TextDecoder().decode(input)) as GltfJson);
  } catch (err) {
    return fail(input.byteLength, format, `Could not parse model: ${(err as Error).message}`);
  }
  if (!json.asset?.version?.startsWith("2")) return fail(input.byteLength, format, "Only glTF 2.0 is supported");

  const issues: Issue[] = [];
  const ext = json.extensionsUsed ?? [];
  for (const req of json.extensionsRequired ?? []) {
    if (!SUPPORTED_EXTENSIONS.has(req)) issues.push({ level: "error", message: `Required extension ${req} is not supported by the viewer` });
  }

  // External references would make the viewer fetch arbitrary URLs — only embedded data is allowed.
  for (const b of json.buffers ?? []) {
    if (b.uri && !b.uri.startsWith("data:")) issues.push({ level: "error", message: "External buffer references are not allowed; export as a self-contained .glb" });
  }
  for (const img of json.images ?? []) {
    if (img.uri && !img.uri.startsWith("data:")) issues.push({ level: "error", message: "External texture references are not allowed; embed textures in the .glb" });
  }

  let triangles = 0;
  let primitives = 0;
  const min: [number, number, number] = [Infinity, Infinity, Infinity];
  const max: [number, number, number] = [-Infinity, -Infinity, -Infinity];
  for (const mesh of json.meshes ?? []) {
    for (const prim of mesh.primitives ?? []) {
      primitives++;
      const mode = prim.mode ?? 4;
      const indexCount = prim.indices != null ? json.accessors?.[prim.indices]?.count : undefined;
      const pos = prim.attributes?.POSITION != null ? json.accessors?.[prim.attributes.POSITION] : undefined;
      const count = indexCount ?? pos?.count ?? 0;
      if (mode === 4) triangles += Math.floor(count / 3);
      else if (mode === 5 || mode === 6) triangles += Math.max(0, count - 2);
      if (pos?.min && pos?.max) {
        for (let i = 0; i < 3; i++) {
          min[i] = Math.min(min[i]!, pos.min[i] ?? 0);
          max[i] = Math.max(max[i]!, pos.max[i] ?? 0);
        }
      }
    }
  }

  const textures = (json.images ?? []).map((img, i) => ({
    name: img.name ?? `image_${i}`,
    mimeType: img.mimeType ?? (img.uri?.match(/^data:([^;]+)/)?.[1] ?? "unknown"),
    bytes: img.bufferView != null ? (json.bufferViews?.[img.bufferView]?.byteLength ?? null) : null,
  }));

  const hasDraco = ext.includes("KHR_draco_mesh_compression");
  const hasKtx2 = ext.includes("KHR_texture_basisu");
  const hasMeshopt = ext.includes("EXT_meshopt_compression");

  if (input.byteLength > LIMITS.maxBytes) issues.push({ level: "error", message: `File is ${(input.byteLength / 1048576).toFixed(1)} MB; the limit is ${LIMITS.maxBytes / 1048576} MB` });
  else if (input.byteLength > LIMITS.warnBytes) issues.push({ level: "warning", message: "Large file — consider stronger compression for mobile" });
  if (triangles > LIMITS.maxTriangles) issues.push({ level: "error", message: `${triangles.toLocaleString()} triangles exceeds the ${LIMITS.maxTriangles.toLocaleString()} limit` });
  else if (triangles > LIMITS.warnTriangles) issues.push({ level: "warning", message: `${triangles.toLocaleString()} triangles may be slow on mid-range phones` });
  if (primitives === 0) issues.push({ level: "error", message: "Model contains no geometry" });
  if (textures.length > LIMITS.warnTextures) issues.push({ level: "warning", message: `${textures.length} textures — consider atlasing to reduce draw calls` });
  if (!hasDraco && !hasMeshopt && triangles > 20_000) issues.push({ level: "info", message: "Geometry is uncompressed — Draco or Meshopt would shrink it significantly" });
  if (!hasKtx2 && textures.length > 0) issues.push({ level: "info", message: "Textures are not KTX2/Basis — GPU-compressed textures cut memory use on mobile" });

  const errors = issues.filter((i) => i.level === "error").length;
  const warnings = issues.filter((i) => i.level === "warning").length;
  const infos = issues.filter((i) => i.level === "info").length;
  const score = errors ? 0 : Math.max(0, 100 - warnings * 20 - infos * 7);
  const bboxValid = Number.isFinite(min[0]) && Number.isFinite(max[0]);

  return {
    valid: errors === 0,
    format,
    byteLength: input.byteLength,
    meshCount: json.meshes?.length ?? 0,
    primitiveCount: primitives,
    triangleCount: triangles,
    materialCount: json.materials?.length ?? 0,
    textureCount: json.textures?.length ?? 0,
    textures,
    extensionsUsed: ext,
    hasDraco,
    hasKtx2,
    hasMeshopt,
    boundingBox: bboxValid ? { min, max } : null,
    issues,
    score,
  };
}
