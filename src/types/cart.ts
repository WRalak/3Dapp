export interface CartLine {
  id: string;
  variantId: string;
  productId: string;
  slug: string;
  name: string;
  brand: string;
  sellerId: string;
  categoryId: string;
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
  /** Automatic campaign discount on this line (0 if none). */
  promotionDiscountCents: number;
  promotionName: string | null;
  promotionId: string | null;
  sellerFunded: boolean;
}

export interface CartDeliveryOption {
  methodId: string;
  type: "SAME_DAY" | "NEXT_DAY" | "STANDARD" | "COURIER" | "PICKUP" | "SELLER_ARRANGED";
  name: string;
  priceCents: number;
  etaMinDays: number;
  etaMaxDays: number;
  pickupAddress: string | null;
}

/** One seller's part of the bag — each seller ships separately. */
export interface CartSellerGroup {
  sellerId: string;
  sellerName: string;
  sellerSlug: string;
  sellerTown: string | null;
  sellerCounty: string | null;
  lines: CartLine[];
  merchandiseCents: number;
  promotionDiscountCents: number;
  sellerFundedDiscountCents: number;
  /** Options for the current county/town (empty until a county is known, except pickup). */
  deliveryOptions: CartDeliveryOption[];
  selected: CartDeliveryOption | null;
}

export interface CartView {
  id: string | null;
  lines: CartLine[];
  groups: CartSellerGroup[];
  itemCount: number;
  currency: string;
  couponCode: string | null;
  couponError: string | null;
  subtotalCents: number;
  promotionDiscountCents: number;
  couponDiscountCents: number;
  discountCents: number;
  shippingCents: number;
  /** True once every seller group has a delivery method chosen. */
  deliveryComplete: boolean;
  freeShipping: boolean;
  taxCents: number;
  taxInclusive: boolean;
  totalCents: number;
  issues: string[];
}
