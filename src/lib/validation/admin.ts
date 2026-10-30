import { z } from "zod";
import { ALL_PERMISSIONS, STAFF_ROLE_KEYS } from "@/lib/auth/permissions";

const money = z.coerce.number().min(0, "Must be positive").max(1_000_000, "Too large");
// Optional money field: blank form inputs ("") and missing keys both mean "not set" (null).
const optionalMoney = z
  .union([z.literal(""), z.null(), money])
  .optional()
  .transform((v) => (v === "" || v == null ? null : v));
const slug = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Lowercase letters, numbers and dashes only")
  .max(80);

export const GARMENT_KINDS = ["TOP", "SHIRT", "JACKET", "COAT", "DRESS", "TROUSERS", "SKIRT", "KNIT", "SHOES", "BAG", "ACCESSORY"] as const;

export const variantInputSchema = z.object({
  id: z.string().optional(),
  sku: z.string().trim().toUpperCase().min(3).max(40).regex(/^[A-Z0-9-]+$/, "Letters, numbers and dashes"),
  size: z.string().trim().min(1).max(20),
  color: z.string().trim().min(1).max(40),
  colorHex: z.string().regex(/^#[0-9a-fA-F]{6}$/, "Use a hex colour like #1a1a1a"),
  price: optionalMoney,
  salePrice: optionalMoney,
  stock: z.coerce.number().int().min(0).max(100000).default(0),
  lowStockThreshold: z.coerce.number().int().min(0).max(1000).default(5),
  isActive: z.boolean().default(true),
});

export const productInputSchema = z
  .object({
    name: z.string().trim().min(2).max(120),
    slug: slug.optional().or(z.literal("")),
    description: z.string().trim().min(10).max(5000),
    brandId: z.string().min(1, "Choose a brand"),
    categoryId: z.string().min(1, "Choose a category"),
    garmentKind: z.enum(GARMENT_KINDS),
    price: money,
    salePrice: optionalMoney,
    saleEndsAt: z.string().optional().or(z.literal("")),
    material: z.string().trim().max(120).optional().or(z.literal("")),
    fabricComposition: z.string().trim().max(200).optional().or(z.literal("")),
    careInstructions: z.string().trim().max(1000).optional().or(z.literal("")),
    measurements: z.string().max(4000).optional().or(z.literal("")),
    specifications: z.string().max(4000).optional().or(z.literal("")),
    tags: z.string().max(400).optional().or(z.literal("")),
    seoTitle: z.string().trim().max(70).optional().or(z.literal("")),
    seoDescription: z.string().trim().max(160).optional().or(z.literal("")),
    isFeatured: z.boolean().default(false),
    status: z.enum(["DRAFT", "PUBLISHED", "ARCHIVED"]).default("DRAFT"),
    collectionIds: z.array(z.string()).default([]),
    variants: z.array(variantInputSchema).min(1, "Add at least one variant").max(200),
  })
  .superRefine((d, ctx) => {
    if (d.salePrice != null && d.salePrice >= d.price) {
      ctx.addIssue({ code: "custom", path: ["salePrice"], message: "Sale price must be below the regular price" });
    }
    const skus = new Set<string>();
    const combos = new Set<string>();
    d.variants.forEach((v, i) => {
      if (skus.has(v.sku)) ctx.addIssue({ code: "custom", path: ["variants", i, "sku"], message: "Duplicate SKU" });
      skus.add(v.sku);
      const combo = `${v.size}|${v.color.toLowerCase()}`;
      if (combos.has(combo)) ctx.addIssue({ code: "custom", path: ["variants", i, "size"], message: "Duplicate size/colour" });
      combos.add(combo);
    });
    for (const field of ["measurements", "specifications"] as const) {
      const raw = d[field];
      if (raw) {
        try {
          JSON.parse(raw);
        } catch {
          ctx.addIssue({ code: "custom", path: [field], message: "Must be valid JSON" });
        }
      }
    }
  });

export type ProductInput = z.input<typeof productInputSchema>;
export type ProductOutput = z.output<typeof productInputSchema>;

export const categoryInputSchema = z.object({
  name: z.string().trim().min(2).max(80),
  slug: slug.optional().or(z.literal("")),
  description: z.string().trim().max(500).optional().or(z.literal("")),
  parentId: z.string().optional().or(z.literal("")),
  sortOrder: z.coerce.number().int().min(0).max(999).default(0),
  isActive: z.boolean().default(true),
});

export const brandInputSchema = z.object({
  name: z.string().trim().min(2).max(80),
  slug: slug.optional().or(z.literal("")),
  description: z.string().trim().max(500).optional().or(z.literal("")),
  isFeatured: z.boolean().default(false),
});

export const collectionInputSchema = z.object({
  name: z.string().trim().min(2).max(80),
  slug: slug.optional().or(z.literal("")),
  description: z.string().trim().max(1000).optional().or(z.literal("")),
  heroImageUrl: z.string().trim().max(500).optional().or(z.literal("")),
  isFeatured: z.boolean().default(false),
  isActive: z.boolean().default(true),
  sortOrder: z.coerce.number().int().min(0).max(999).default(0),
});

export const stockAdjustmentSchema = z.object({
  variantId: z.string().min(1),
  type: z.enum(["RESTOCK", "ADJUSTMENT", "RETURN"]),
  quantity: z.coerce.number().int().min(-100000).max(100000).refine((n) => n !== 0, "Quantity cannot be zero"),
  reason: z.string().trim().min(3, "Give a reason").max(200),
});

export const ORDER_STATUSES = ["PENDING_PAYMENT", "PAID", "PROCESSING", "SHIPPED", "DELIVERED", "CANCELLED", "REFUNDED"] as const;

export const orderStatusUpdateSchema = z.object({
  orderId: z.string().min(1),
  status: z.enum(["PROCESSING", "SHIPPED", "DELIVERED"]),
  note: z.string().trim().max(500).optional().or(z.literal("")),
  carrier: z.string().trim().max(60).optional().or(z.literal("")),
  trackingNumber: z.string().trim().max(80).optional().or(z.literal("")),
  trackingUrl: z.url().max(500).optional().or(z.literal("")),
});

export const cancelOrderSchema = z.object({
  orderId: z.string().min(1),
  reason: z.string().trim().min(3).max(500),
});

export const refundSchema = z.object({
  orderId: z.string().min(1),
  amount: z.coerce.number().positive("Enter an amount").max(1_000_000),
  reason: z.string().trim().min(3).max(500),
  restock: z.boolean().default(true),
});

export const inviteStaffSchema = z.object({
  email: z.string().trim().toLowerCase().pipe(z.email()),
  roleKeys: z.array(z.enum(STAFF_ROLE_KEYS as [string, ...string[]])).min(1, "Choose at least one role"),
});

export const staffRolesSchema = z.object({
  userId: z.string().min(1),
  roleKeys: z.array(z.enum(STAFF_ROLE_KEYS as [string, ...string[]])),
  permissions: z.array(z.enum(ALL_PERMISSIONS as [string, ...string[]])).default([]),
});

export const rolePermissionsSchema = z.object({
  roleId: z.string().min(1),
  permissions: z.array(z.enum(ALL_PERMISSIONS as [string, ...string[]])),
});

export const contentBlockSchema = z.object({
  id: z.string().optional(),
  type: z.enum(["HERO", "BANNER", "PROMOTION", "EDITORIAL", "TESTIMONIAL"]),
  placement: z.string().trim().min(2).max(60),
  title: z.string().trim().min(1).max(160),
  subtitle: z.string().trim().max(300).optional().or(z.literal("")),
  body: z.string().trim().max(3000).optional().or(z.literal("")),
  imageUrl: z.string().trim().max(500).optional().or(z.literal("")),
  ctaLabel: z.string().trim().max(40).optional().or(z.literal("")),
  ctaHref: z
    .string()
    .trim()
    .max(300)
    .refine((v) => !v || v.startsWith("/") || /^https:\/\//.test(v), "Use a relative path or https URL")
    .optional()
    .or(z.literal("")),
  sortOrder: z.coerce.number().int().min(0).max(999).default(0),
  isActive: z.boolean().default(true),
});

export const navLinkSchema = z.object({
  id: z.string().optional(),
  label: z.string().trim().min(1).max(40),
  href: z
    .string()
    .trim()
    .max(300)
    .refine((v) => v.startsWith("/") || /^https:\/\//.test(v), "Use a relative path or https URL"),
  location: z.enum(["HEADER", "FOOTER"]),
  group: z.string().trim().max(40).optional().or(z.literal("")),
  sortOrder: z.coerce.number().int().min(0).max(999).default(0),
  isActive: z.boolean().default(true),
});

export const couponInputSchema = z
  .object({
    code: z.string().trim().toUpperCase().regex(/^[A-Z0-9_-]{3,40}$/, "3–40 letters, numbers, dashes"),
    description: z.string().trim().max(200).optional().or(z.literal("")),
    type: z.enum(["PERCENTAGE", "FIXED", "FREE_SHIPPING"]),
    value: z.coerce.number().min(0).max(1_000_000),
    minSubtotal: z.coerce.number().min(0).default(0),
    maxRedemptions: z.union([z.literal(""), z.coerce.number().int().positive()]).optional(),
    perUserLimit: z.union([z.literal(""), z.coerce.number().int().positive()]).optional(),
    endsAt: z.string().optional().or(z.literal("")),
    isActive: z.boolean().default(true),
  })
  .refine((d) => d.type !== "PERCENTAGE" || (d.value > 0 && d.value <= 100), {
    message: "Percentage must be between 1 and 100",
    path: ["value"],
  });

export const analyticsRangeSchema = z.object({
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});
