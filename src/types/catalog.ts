/** Serializable DTOs shared between server and client components. */

export type GarmentKindName =
  | "TOP"
  | "SHIRT"
  | "JACKET"
  | "COAT"
  | "DRESS"
  | "TROUSERS"
  | "SKIRT"
  | "KNIT"
  | "SHOES"
  | "BAG"
  | "ACCESSORY";

export interface ColorSwatch {
  name: string;
  hex: string;
}

export interface ProductCardData {
  id: string;
  slug: string;
  name: string;
  brand: string;
  category: string;
  priceCents: number;
  compareAtCents: number | null;
  image: string | null;
  hoverImage: string | null;
  colors: ColorSwatch[];
  has3d: boolean;
  isNew: boolean;
  inStock: boolean;
  ratingAvg: number;
  ratingCount: number;
  garmentKind: GarmentKindName;
}

export interface VariantData {
  id: string;
  sku: string;
  size: string;
  color: string;
  colorHex: string;
  priceCents: number;
  compareAtCents: number | null;
  available: number;
}

export interface ProductImageData {
  id: string;
  url: string;
  alt: string;
  kind: "GALLERY" | "FRONT" | "BACK" | "SIDE" | "FABRIC_DETAIL";
  color: string | null;
}

export interface Model3DData {
  url: string;
  hasDraco: boolean;
  hasKtx2: boolean;
  hasMeshopt: boolean;
  fileSize: number;
}

export interface ProductDetail extends ProductCardData {
  description: string;
  material: string | null;
  fabricComposition: string | null;
  careInstructions: string | null;
  measurements: Record<string, Record<string, number>> | null;
  specifications: { label: string; value: string }[] | null;
  tags: string[];
  categorySlug: string;
  brandSlug: string;
  images: ProductImageData[];
  variants: VariantData[];
  sizes: string[];
  model: Model3DData | null;
  totalStock: number;
  seoTitle: string | null;
  seoDescription: string | null;
}

export interface ShowroomItem {
  id: string;
  slug: string;
  name: string;
  brand: string;
  priceCents: number;
  compareAtCents: number | null;
  garmentKind: GarmentKindName;
  primaryColor: string;
  image: string | null;
  model: Model3DData | null;
}

export interface Facets {
  categories: { slug: string; name: string; count: number }[];
  brands: { slug: string; name: string }[];
  sizes: string[];
  colors: ColorSwatch[];
  priceRange: { min: number; max: number };
}

export interface Paginated<T> {
  items: T[];
  total: number;
  page: number;
  pageCount: number;
}
