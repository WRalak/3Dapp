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

export async function ensureCounty(name = "Nairobi", code = 47) {
  return testDb.county.upsert({ where: { code }, update: {}, create: { code, name, slug: name.toLowerCase().replace(/[^a-z0-9]+/g, "-") } });
}

/** An approved seller (with profile + wallet) owned by a fresh SELLER user. */
export async function createSeller(opts: { status?: "PENDING" | "APPROVED" | "REJECTED" | "SUSPENDED"; commissionRateBps?: number | null } = {}) {
  const owner = await createUser({ role: "SELLER", staff: false });
  const county = await ensureCounty();
  const slug = uid("s");
  const seller = await testDb.seller.create({
    data: {
      ownerId: owner.id,
      slug,
      businessName: `Studio ${slug}`,
      status: opts.status ?? "APPROVED",
      countyId: county.id,
      town: "Nairobi",
      commissionRateBps: opts.commissionRateBps ?? null,
      approvedAt: (opts.status ?? "APPROVED") === "APPROVED" ? new Date() : null,
      profile: { create: { contactName: "Owner", email: owner.email, phone: "+254712345678", description: "A Nairobi studio" } },
      wallet: { create: {} },
      zones: {
        create: {
          name: "Nairobi",
          counties: { create: { countyId: county.id } },
          methods: {
            create: [
              { type: "STANDARD", name: "Standard delivery", priceCents: 35_000, minDays: 1, maxDays: 3 },
              { type: "PICKUP", name: "Studio pickup", priceCents: 0, minDays: 0, maxDays: 1, pickupAddress: "Studio, Kilimani" },
            ],
          },
        },
      },
    },
  });
  return { seller, owner, county };
}

export async function createProduct(opts: { stock?: number; priceCents?: number; salePriceCents?: number | null; sellerId?: string } = {}) {
  const slug = uid("p");
  const sellerId = opts.sellerId ?? (await createSeller()).seller.id;
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
      approvalStatus: "APPROVED",
      sellerId,
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

/**
 * A valid Kenyan checkout for whatever is in the current browser's cart, choosing each seller's
 * delivery method of `type` (default STANDARD).
 */
export async function checkoutInput(over: Record<string, unknown> = {}, type: "STANDARD" | "PICKUP" = "STANDARD") {
  const { getCart } = await import("@/server/services/cart.service");
  const { checkoutSchema } = await import("@/lib/validation/checkout");
  const county = await ensureCounty();
  const cart = await getCart({ countyId: county.id, town: "Nairobi" });
  const delivery = Object.fromEntries(cart.groups.map((g) => [g.sellerId, (g.deliveryOptions.find((o) => o.type === type) ?? g.deliveryOptions[0])?.methodId ?? "none"]));
  return checkoutSchema.parse({
    email: "buyer@example.com",
    customerName: "Buyer",
    phone: "+254700000001",
    paymentMethod: "SANDBOX",
    idempotencyKey: crypto.randomUUID(),
    address: { fullName: "Buyer", phone: "0712345678", countyId: county.id, town: "Nairobi", estate: "Kilimani", building: "Riverside Apts", line1: "", directions: "" },
    delivery,
    ...over,
  });
}
