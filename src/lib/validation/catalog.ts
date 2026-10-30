import { z } from "zod";

export const SORT_OPTIONS = ["featured", "newest", "price-asc", "price-desc", "best-selling", "rating"] as const;
export type SortOption = (typeof SORT_OPTIONS)[number];

const csv = z
  .union([z.string(), z.array(z.string())])
  .optional()
  .transform((v) => {
    if (!v) return [] as string[];
    const arr = Array.isArray(v) ? v : v.split(",");
    return arr.map((s) => s.trim()).filter(Boolean).slice(0, 20);
  });

/** Parses shop URL search params into a validated filter object. */
export const productFilterSchema = z.object({
  q: z.string().trim().max(100).optional().catch(undefined),
  category: z.string().trim().max(80).optional().catch(undefined),
  collection: z.string().trim().max(80).optional().catch(undefined),
  brand: csv,
  size: csv,
  color: csv,
  minPrice: z.coerce.number().int().min(0).optional().catch(undefined),
  maxPrice: z.coerce.number().int().min(0).optional().catch(undefined),
  sort: z.enum(SORT_OPTIONS).default("featured").catch("featured"),
  page: z.coerce.number().int().min(1).max(500).default(1).catch(1),
  onSale: z
    .enum(["1", "true"])
    .optional()
    .transform((v) => !!v)
    .catch(false),
  has3d: z
    .enum(["1", "true"])
    .optional()
    .transform((v) => !!v)
    .catch(false),
});

export type ProductFilter = z.output<typeof productFilterSchema>;

export const cartAddSchema = z.object({
  variantId: z.string().min(1),
  quantity: z.coerce.number().int().min(1).max(20).default(1),
});

export const cartUpdateSchema = z.object({
  itemId: z.string().min(1),
  quantity: z.coerce.number().int().min(0).max(20),
});

export const couponApplySchema = z.object({
  code: z.string().trim().toUpperCase().min(2).max(40),
});
