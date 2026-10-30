/** Public, non-secret storefront configuration (safe for client bundles). */
export const site = {
  name: "Mtindo",
  tagline: "Kenyan fashion, on the rail",
  description:
    "Mtindo is a marketplace for Kenyan designers, boutiques and fashion brands. Browse collections on a 3D clothing rail, pay with M-Pesa and get delivery across Kenya.",
  supportEmail: "care@mtindo.co.ke",
  supportPhone: "+254 700 000 000",
  social: { instagram: "https://instagram.com", tiktok: "https://tiktok.com" },
} as const;

/** Labels are dictionary keys (see src/i18n). */
export const mainNav = [
  { key: "nav.shop", href: "/shop" },
  { key: "nav.designers", href: "/designers" },
  { key: "nav.collections", href: "/collections" },
  { key: "nav.showroom", href: "/showroom" },
  { key: "nav.newArrivals", href: "/new-arrivals" },
] as const;

export const SHIPPING_METHODS = [
  { id: "standard", label: "Standard", description: "3–5 business days", priceCents: 35000, freeOverCents: 1000000 },
  { id: "express", label: "Express", description: "1–2 business days", priceCents: 60000, freeOverCents: null },
  { id: "pickup", label: "Pickup", description: "Collect from the seller", priceCents: 0, freeOverCents: null },
] as const;

export type ShippingMethodId = (typeof SHIPPING_METHODS)[number]["id"];

export const SIZES = ["XXS", "XS", "S", "M", "L", "XL", "XXL", "36", "37", "38", "39", "40", "41", "42", "43", "44", "ONE SIZE"] as const;

export const PAGE_SIZE = 24;
