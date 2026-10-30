export interface CartLine {
  id: string;
  variantId: string;
  productId: string;
  slug: string;
  name: string;
  brand: string;
  size: string;
  color: string;
  colorHex: string;
  sku: string;
  image: string | null;
  unitPriceCents: number;
  compareAtCents: number | null;
  quantity: number;
  available: number;
  lineTotalCents: number;
}

export interface CartView {
  id: string | null;
  lines: CartLine[];
  itemCount: number;
  currency: string;
  couponCode: string | null;
  couponError: string | null;
  subtotalCents: number;
  discountCents: number;
  shippingCents: number;
  taxCents: number;
  taxInclusive: boolean;
  totalCents: number;
  freeShippingRemainingCents: number | null;
  issues: string[];
}
