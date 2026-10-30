import "server-only";
import { randomUUID } from "node:crypto";
import { db } from "@/lib/db/prisma";
import { env } from "@/config/env";
import { storage } from "@/lib/storage";
import { AppError, badRequest, notFound } from "@/lib/errors";
import { signPayload, verifyPayload } from "@/lib/security/crypto";
import { inspectGltf } from "@/features/showroom/gltf-inspect";
import { sanitizeFileName, sniffImage, validateDeclaredFile, type UploadKind } from "@/features/uploads/file-validation";
import type { AuthUser } from "@/lib/auth/guards";
import { audit } from "./audit.service";
import { invalidateCatalogCache } from "./catalog.service";

interface UploadClaims extends Record<string, unknown> {
  key: string;
  kind: UploadKind;
  contentType: string;
  size: number;
  name: string;
  uid: string;
}

/** Step 1: validate the declared file and hand back a short-lived signed upload URL. */
export async function createUpload(input: { kind: UploadKind; fileName: string; contentType: string; size: number }, actor: AuthUser) {
  const problem = validateDeclaredFile(input.kind, input.fileName, input.contentType, input.size);
  if (problem) throw new AppError("VALIDATION", problem);
  const safe = sanitizeFileName(input.fileName);
  const prefix = input.kind === "model" ? "models" : input.kind === "document" ? "private/documents" : "images";
  const key = `${prefix}/${new Date().toISOString().slice(0, 7)}/${randomUUID()}-${safe}`;
  const upload = await storage().createSignedUpload(key, input.contentType, input.size);
  const claim = signPayload({ key, kind: input.kind, contentType: input.contentType, size: input.size, name: input.fileName.slice(0, 120), uid: actor.id } satisfies UploadClaims, env().AUTH_SECRET, 30 * 60);
  return { upload, claim };
}

export function readClaim(claim: string, actor: AuthUser) {
  const c = verifyPayload<UploadClaims>(claim, env().AUTH_SECRET);
  if (!c || c.uid !== actor.id) throw badRequest("Upload session is invalid or expired");
  return c;
}

/** Step 2a: register an uploaded product image after verifying its real content. */
export async function completeImageUpload(input: { claim: string; productId: string; alt: string; kind?: "GALLERY" | "FRONT" | "BACK" | "SIDE" | "FABRIC_DETAIL"; color?: string }, actor: AuthUser) {
  const c = readClaim(input.claim, actor);
  if (c.kind !== "image") throw badRequest("Not an image upload");
  const product = await db.product.findUnique({ where: { id: input.productId }, select: { id: true, slug: true } });
  if (!product) throw notFound("Product");
  const body = await storage().read(c.key).catch(() => null);
  if (!body) throw badRequest("Upload not found — please retry");
  const sniffed = sniffImage(body);
  if (!sniffed || sniffed !== c.contentType || body.byteLength > 10 * 1024 * 1024) {
    await storage().remove(c.key);
    throw new AppError("VALIDATION", "File content does not match an allowed image type");
  }
  const count = await db.productImage.count({ where: { productId: product.id } });
  const image = await db.productImage.create({
    data: { productId: product.id, url: storage().publicUrl(c.key), alt: input.alt.slice(0, 200), kind: input.kind ?? "GALLERY", color: input.color || null, sortOrder: count },
  });
  await audit(actor.id, "product.image_uploaded", "Product", product.id, { imageId: image.id });
  await invalidateCatalogCache(product.slug);
  return image;
}

/** Step 2b: register an uploaded 3D model, then inspect it. */
export async function completeModelUpload(input: { claim: string; name?: string; productId?: string | null }, actor: AuthUser) {
  const c = readClaim(input.claim, actor);
  if (c.kind !== "model") throw badRequest("Not a model upload");
  const size = await storage().size(c.key);
  if (size == null) throw badRequest("Upload not found — please retry");
  const asset = await db.productModel3D.upsert({
    where: { fileKey: c.key },
    update: {},
    create: {
      name: (input.name || c.name).slice(0, 120),
      fileKey: c.key,
      url: storage().publicUrl(c.key),
      format: c.name.toLowerCase().endsWith(".gltf") ? "gltf" : "glb",
      fileSize: size,
      status: "PROCESSING",
      uploadedById: actor.id,
    },
  });
  await audit(actor.id, "asset.uploaded", "ProductModel3D", asset.id, { size });
  const processed = await processModelAsset(asset.id);
  if (input.productId && processed.status === "READY") await assignModel(asset.id, input.productId, actor);
  return processed;
}

/** Validates and analyses a model. Invalid files are rejected and deleted from storage. */
export async function processModelAsset(assetId: string) {
  const asset = await db.productModel3D.findUnique({ where: { id: assetId } });
  if (!asset) throw notFound("Asset");
  try {
    const body = await storage().read(asset.fileKey);
    const report = inspectGltf(new Uint8Array(body));
    const status = report.valid ? "READY" : "REJECTED";
    if (!report.valid) await storage().remove(asset.fileKey).catch(() => undefined);
    return await db.productModel3D.update({
      where: { id: asset.id },
      data: {
        status,
        fileSize: body.byteLength,
        format: report.format,
        hasDraco: report.hasDraco,
        hasKtx2: report.hasKtx2,
        hasMeshopt: report.hasMeshopt,
        triangleCount: report.triangleCount,
        meshCount: report.meshCount,
        materialCount: report.materialCount,
        textureCount: report.textureCount,
        textureInfo: report.textures,
        boundingBox: report.boundingBox ?? undefined,
        compatibility: { score: report.score, extensions: report.extensionsUsed, issues: report.issues } as object,
        errorMessage: report.valid ? null : report.issues.filter((i) => i.level === "error").map((i) => i.message).join("; "),
        processedAt: new Date(),
        ...(report.valid ? {} : { productId: null }),
      },
    });
  } catch (err) {
    return db.productModel3D.update({ where: { id: asset.id }, data: { status: "FAILED", errorMessage: (err as Error).message.slice(0, 500), processedAt: new Date() } });
  }
}

/** Assigns (or replaces) the model shown for a product. */
export async function assignModel(assetId: string, productId: string, actor: AuthUser) {
  const asset = await db.productModel3D.findUnique({ where: { id: assetId } });
  if (!asset || asset.deletedAt) throw notFound("Asset");
  if (asset.status !== "READY") throw badRequest("Only validated models can be assigned");
  const product = await db.product.findUnique({ where: { id: productId }, select: { id: true, slug: true } });
  if (!product) throw notFound("Product");
  await db.$transaction([
    db.productModel3D.updateMany({ where: { productId, id: { not: assetId } }, data: { productId: null } }),
    db.productModel3D.update({ where: { id: assetId }, data: { productId } }),
  ]);
  await audit(actor.id, "asset.assigned", "ProductModel3D", assetId, { productId });
  await invalidateCatalogCache(product.slug);
}

export async function unassignModel(assetId: string, actor: AuthUser) {
  const asset = await db.productModel3D.update({ where: { id: assetId }, data: { productId: null }, include: { product: { select: { slug: true } } } });
  await audit(actor.id, "asset.unassigned", "ProductModel3D", assetId);
  await invalidateCatalogCache(asset.product?.slug);
}

export async function deleteModel(assetId: string, actor: AuthUser) {
  const asset = await db.productModel3D.findUnique({ where: { id: assetId } });
  if (!asset) throw notFound("Asset");
  await db.productModel3D.update({ where: { id: assetId }, data: { deletedAt: new Date(), productId: null } });
  await storage().remove(asset.fileKey).catch(() => undefined);
  await audit(actor.id, "asset.deleted", "ProductModel3D", assetId);
  await invalidateCatalogCache();
}

export async function deleteProductImage(imageId: string, actor: AuthUser) {
  const image = await db.productImage.delete({ where: { id: imageId }, include: { product: { select: { slug: true, id: true } } } });
  const key = image.url.match(/\/media\/(.+)$/)?.[1];
  if (key) await storage().remove(key).catch(() => undefined);
  await audit(actor.id, "product.image_deleted", "Product", image.product.id, { imageId });
  await invalidateCatalogCache(image.product.slug);
}
