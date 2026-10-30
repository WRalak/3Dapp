import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { resetBrowser } from "../support/request-mock";
import { createSeller, createUser, ensureRoles, testDb, uid } from "../support/factories";
import { createSession } from "@/lib/auth/session";
import { requirePermission } from "@/lib/auth/guards";
import { createProduct, deleteProduct, updateProduct } from "@/server/services/product-admin.service";
import { adjustStock } from "@/server/services/inventory.service";
import { listProducts } from "@/server/services/catalog.service";
import { productInputSchema } from "@/lib/validation/admin";
import { productFilterSchema } from "@/lib/validation/catalog";

beforeAll(ensureRoles);
beforeEach(() => resetBrowser());

async function actor(role: "SUPER_ADMIN" | "INVENTORY_MANAGER" = "SUPER_ADMIN") {
  const user = await createUser({ role });
  await createSession(user, { mfaVerified: true });
  return requirePermission();
}

async function fixtures() {
  const s = uid("f");
  const brand = await testDb.brand.create({ data: { name: s, slug: `brand-${s}` } });
  const category = await testDb.category.create({ data: { name: s, slug: `cat-${s}` } });
  return { brand, category, s };
}

const productInput = (brandId: string, categoryId: string, sku: string, status = "PUBLISHED") =>
  productInputSchema.parse({
    name: `Linen Shirt ${sku}`,
    description: "Relaxed linen shirt for warm days.",
    brandId,
    categoryId,
    garmentKind: "SHIRT",
    price: "120",
    salePrice: "",
    status,
    measurements: '{"M": {"chest": 100}}',
    variants: [
      { sku: `${sku}-M`, size: "M", color: "Ivory", colorHex: "#efe9de", stock: "4" },
      { sku: `${sku}-L`, size: "L", color: "Ivory", colorHex: "#efe9de", stock: "0" },
    ],
  });

describe("product management", () => {
  it("creates products with variants, inventory, movements and an audit entry", async () => {
    const me = await actor();
    const { brand, category, s } = await fixtures();
    const sku = s.toUpperCase();
    const product = await createProduct(productInput(brand.id, category.id, sku), me);
    const full = await testDb.product.findUniqueOrThrow({ where: { id: product.id }, include: { variants: { include: { inventory: { include: { movements: true } } } } } });
    expect(full.priceCents).toBe(12000);
    expect(full.variants).toHaveLength(2);
    expect(full.variants.find((v) => v.size === "M")!.inventory!.movements).toHaveLength(1);
    expect(await testDb.auditLog.count({ where: { entityId: product.id, action: "product.created" } })).toBe(1);
    const listed = await listProducts(productFilterSchema.parse({ category: category.slug }));
    expect(listed.items.map((i) => i.id)).toContain(product.id);
  });

  it("rejects SKUs used by another product", async () => {
    const me = await actor();
    const { brand, category, s } = await fixtures();
    await createProduct(productInput(brand.id, category.id, s.toUpperCase()), me);
    await expect(createProduct(productInput(brand.id, category.id, s.toUpperCase()), me)).rejects.toMatchObject({ code: "CONFLICT" });
  });

  it("downgrades publish attempts without the publish permission", async () => {
    const me = await actor("INVENTORY_MANAGER");
    const { brand, category, s } = await fixtures();
    const p = await createProduct(productInput(brand.id, category.id, s.toUpperCase(), "PUBLISHED"), me);
    expect(p.status).toBe("DRAFT");
  });

  it("soft-deletes products and their removed variants", async () => {
    const me = await actor();
    const { brand, category, s } = await fixtures();
    const sku = s.toUpperCase();
    const p = await createProduct(productInput(brand.id, category.id, sku), me);
    const input = productInput(brand.id, category.id, sku);
    const existing = await testDb.productVariant.findMany({ where: { productId: p.id } });
    input.variants = [{ ...input.variants[0]!, id: existing.find((v) => v.size === "M")!.id }];
    await updateProduct(p.id, input, me);
    expect(await testDb.productVariant.count({ where: { productId: p.id, deletedAt: null } })).toBe(1);
    await deleteProduct(p.id, me);
    const deleted = await testDb.product.findUniqueOrThrow({ where: { id: p.id } });
    expect(deleted.deletedAt).not.toBeNull();
    const listed = await listProducts(productFilterSchema.parse({ category: category.slug }));
    expect(listed.items).toHaveLength(0);
  });
});

describe("inventory", () => {
  it("records adjustments and refuses to go below reserved stock", async () => {
    const me = await actor();
    const { brand, category, s } = await fixtures();
    const p = await createProduct(productInput(brand.id, category.id, s.toUpperCase()), me);
    const v = await testDb.productVariant.findFirstOrThrow({ where: { productId: p.id, size: "M" } });
    await adjustStock({ variantId: v.id, type: "RESTOCK", quantity: 6, reason: "delivery" }, me.id);
    expect((await testDb.inventory.findUniqueOrThrow({ where: { variantId: v.id } })).quantity).toBe(10);
    await testDb.inventory.update({ where: { variantId: v.id }, data: { reserved: 8 } });
    await expect(adjustStock({ variantId: v.id, type: "ADJUSTMENT", quantity: -5, reason: "count" }, me.id)).rejects.toMatchObject({ code: "VALIDATION" });
  });

  it("database constraints forbid negative stock", async () => {
    const { brand, category, s } = await fixtures();
    const { seller } = await createSeller();
    const p = await testDb.product.create({ data: { name: s, slug: s, description: "x", brandId: brand.id, categoryId: category.id, priceCents: 1, sellerId: seller.id } });
    const v = await testDb.productVariant.create({ data: { productId: p.id, sku: s.toUpperCase(), size: "M", color: "X", colorHex: "#000000" } });
    await expect(testDb.inventory.create({ data: { variantId: v.id, quantity: -1 } })).rejects.toBeTruthy();
  });
});

describe("immutable records", () => {
  it("rejects edits and deletes of audit logs and order history", async () => {
    const log = await testDb.auditLog.create({ data: { action: "test", entityType: "Test" } });
    await expect(testDb.auditLog.update({ where: { id: log.id }, data: { action: "tampered" } })).rejects.toThrow(/append-only/);
    await expect(testDb.auditLog.delete({ where: { id: log.id } })).rejects.toThrow(/append-only/);
    const order = await testDb.order.findFirst({ include: { statusHistory: true }, where: { statusHistory: { some: {} } } });
    if (order) await expect(testDb.orderStatusHistory.delete({ where: { id: order.statusHistory[0]!.id } })).rejects.toThrow(/append-only/);
  });
});
