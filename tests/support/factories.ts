import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";
import { DEFAULT_ROLES, PERMISSIONS, ROLE_KEYS, type RoleKey } from "@/lib/auth/permissions";
import { hashPassword } from "@/lib/security/password";

export const testDb = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }) });

let counter = 0;
export const uid = (p = "t") => `${p}${Date.now().toString(36)}${(counter++).toString(36)}`;

export async function ensureRoles() {
  for (const [key, meta] of Object.entries(PERMISSIONS)) {
    await testDb.permission.upsert({ where: { key }, update: {}, create: { key, group: meta.group, description: meta.description } });
  }
  const perms = await testDb.permission.findMany();
  for (const key of ROLE_KEYS) {
    const role = await testDb.role.upsert({ where: { key }, update: {}, create: { key, name: DEFAULT_ROLES[key].name, isSystem: true } });
    await testDb.rolePermission.deleteMany({ where: { roleId: role.id } });
    await testDb.rolePermission.createMany({
      data: DEFAULT_ROLES[key].permissions.map((p) => ({ roleId: role.id, permissionId: perms.find((x) => x.key === p)!.id })),
    });
  }
}

export async function createUser(opts: { role?: RoleKey; password?: string; email?: string; staff?: boolean } = {}) {
  const role = opts.role ?? "CUSTOMER";
  return testDb.user.create({
    data: {
      email: opts.email ?? `${uid("u")}@example.com`,
      name: "Test User",
      passwordHash: await hashPassword(opts.password ?? "Correct-Horse-9"),
      emailVerifiedAt: new Date(),
      isStaff: opts.staff ?? role !== "CUSTOMER",
      profile: { create: {} },
      wishlist: { create: {} },
      roles: { create: { role: { connect: { key: role } } } },
    },
  });
}

export async function createProduct(opts: { stock?: number; priceCents?: number; salePriceCents?: number | null } = {}) {
  const slug = uid("p");
  const brand = await testDb.brand.create({ data: { name: `Brand ${slug}`, slug: `b-${slug}` } });
  const category = await testDb.category.create({ data: { name: `Cat ${slug}`, slug: `c-${slug}` } });
  const product = await testDb.product.create({
    data: {
      name: `Product ${slug}`,
      slug,
      description: "A test product description",
      brandId: brand.id,
      categoryId: category.id,
      status: "PUBLISHED",
      publishedAt: new Date(),
      priceCents: opts.priceCents ?? 10_000,
      salePriceCents: opts.salePriceCents ?? null,
      garmentKind: "DRESS",
    },
  });
  const variant = await testDb.productVariant.create({ data: { productId: product.id, sku: `SKU-${slug}`.toUpperCase(), size: "M", color: "Ink", colorHex: "#111111" } });
  await testDb.inventory.create({ data: { variantId: variant.id, quantity: opts.stock ?? 5, lowStockThreshold: 1 } });
  return { product, variant, brand, category };
}
