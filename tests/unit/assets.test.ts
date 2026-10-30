import { describe, expect, it } from "vitest";
import { inspectGltf } from "@/features/showroom/gltf-inspect";
import { sanitizeFileName, sniffImage, validateDeclaredFile } from "@/features/uploads/file-validation";
import { buildGarmentGlb } from "../../prisma/garment-geometry";

const json = (o: unknown) => new TextEncoder().encode(JSON.stringify(o));

describe("glTF inspector", () => {
  it("accepts a well-formed GLB and reports its structure", async () => {
    const glb = await buildGarmentGlb("DRESS", "#336699", 16);
    const report = inspectGltf(glb);
    expect(report.valid).toBe(true);
    expect(report.format).toBe("glb");
    expect(report.meshCount).toBe(1);
    expect(report.triangleCount).toBeGreaterThan(100);
    expect(report.boundingBox?.max[1]).toBeCloseTo(0.6, 1);
    expect(report.score).toBeGreaterThan(0);
  });

  it("rejects non-glTF payloads such as executables", () => {
    const exe = new Uint8Array([0x4d, 0x5a, 0x90, 0x00, 1, 2, 3, 4, 5, 6, 7, 8]);
    const report = inspectGltf(exe);
    expect(report.valid).toBe(false);
    expect(report.issues[0]!.message).toMatch(/Not a glTF/);
  });

  it("rejects GLBs whose length header lies", async () => {
    const glb = new Uint8Array(await buildGarmentGlb("TOP", "#000000", 8));
    new DataView(glb.buffer).setUint32(8, glb.byteLength + 100, true);
    expect(inspectGltf(glb).valid).toBe(false);
  });

  it("rejects external references (no arbitrary URL fetches)", () => {
    const report = inspectGltf(json({ asset: { version: "2.0" }, buffers: [{ uri: "https://evil.example/x.bin", byteLength: 10 }], meshes: [] }));
    expect(report.valid).toBe(false);
    expect(report.issues.some((i) => /External buffer/.test(i.message))).toBe(true);
  });

  it("rejects unsupported required extensions and glTF 1.0", () => {
    expect(inspectGltf(json({ asset: { version: "2.0" }, extensionsRequired: ["VENDOR_magic"], meshes: [{ primitives: [{ attributes: { POSITION: 0 } }] }], accessors: [{ count: 3 }] })).valid).toBe(false);
    expect(inspectGltf(json({ asset: { version: "1.0" } })).valid).toBe(false);
  });

  it("recognises Draco / KTX2 / Meshopt optimisation", () => {
    const report = inspectGltf(
      json({
        asset: { version: "2.0" },
        extensionsUsed: ["KHR_draco_mesh_compression", "KHR_texture_basisu", "EXT_meshopt_compression"],
        meshes: [{ primitives: [{ attributes: { POSITION: 0 }, indices: 1 }] }],
        accessors: [{ count: 300, min: [0, 0, 0], max: [1, 1, 1] }, { count: 900 }],
      }),
    );
    expect(report).toMatchObject({ hasDraco: true, hasKtx2: true, hasMeshopt: true, triangleCount: 300, valid: true });
  });
});

describe("upload allow-list", () => {
  it("only allows known image and model types with matching extensions", () => {
    expect(validateDeclaredFile("image", "photo.jpg", "image/jpeg", 1000)).toBeNull();
    expect(validateDeclaredFile("image", "photo.svg", "image/svg+xml", 1000)).toMatch(/not allowed/);
    expect(validateDeclaredFile("image", "photo.php", "image/jpeg", 1000)).toMatch(/does not match/);
    expect(validateDeclaredFile("model", "coat.glb", "model/gltf-binary", 1000)).toBeNull();
    expect(validateDeclaredFile("model", "setup.exe", "application/octet-stream", 1000)).toMatch(/does not match/);
    expect(validateDeclaredFile("model", "huge.glb", "model/gltf-binary", 999 * 1024 * 1024)).toMatch(/exceeds/);
    expect(validateDeclaredFile("image", "empty.png", "image/png", 0)).toMatch(/empty/);
  });
  it("sniffs real image content", () => {
    expect(sniffImage(new Uint8Array([0xff, 0xd8, 0xff, 0xe0]))).toBe("image/jpeg");
    expect(sniffImage(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))).toBe("image/png");
    expect(sniffImage(new TextEncoder().encode("<svg onload=alert(1)>"))).toBeNull();
  });
  it("sanitises file names", () => {
    expect(sanitizeFileName("../../My Coat (final).GLB")).toBe("my-coat-final.glb");
  });
});
