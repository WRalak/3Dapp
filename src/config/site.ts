/** Public, non-secret storefront configuration (safe for client bundles). */
export const site = {
  name: "Atelier",
  tagline: "A digital boutique for considered clothing",
  description:
    "Atelier is a fashion house and digital showroom. Browse the rail, pick a piece, inspect it in 3D and have it delivered.",
  supportEmail: "care@atelier.example",
  social: { instagram: "https://instagram.com", pinterest: "https://pinterest.com" },
} as const;

export const mainNav = [
  { label: "Shop", href: "/shop" },
  { label: "Collections", href: "/collections" },
  { label: "3D Showroom", href: "/showroom" },
  { label: "New Arrivals", href: "/new-arrivals" },
  { label: "About", href: "/about" },
] as const;

export const SHIPPING_METHODS = [
  { id: "standard", label: "Standard", description: "3–5 business days", priceCents: 800, freeOverCents: 25000 },
  { id: "express", label: "Express", description: "1–2 business days", priceCents: 2000, freeOverCents: null },
  { id: "pickup", label: "Atelier pickup", description: "Collect from our studio", priceCents: 0, freeOverCents: null },
] as const;

export type ShippingMethodId = (typeof SHIPPING_METHODS)[number]["id"];

export const SIZES = ["XXS", "XS", "S", "M", "L", "XL", "XXL", "36", "37", "38", "39", "40", "41", "42", "43", "44", "ONE SIZE"] as const;

export const PAGE_SIZE = 24;
