/**
 * Development seed: roles/permissions, staff & demo customer, a full catalogue with
 * variants and stock, collections, content, coupons, procedurally generated GLB models,
 * and ~60 days of order history so analytics have real data to aggregate.
 *
 *   npm run db:seed            (idempotent for roles/permissions; catalogue seeded once)
 */
import "dotenv/config";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomBytes } from "node:crypto";
import { hash } from "@node-rs/argon2";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient, type GarmentKind } from "../src/generated/prisma/client";
import { DEFAULT_ROLES, PERMISSIONS, ROLE_KEYS } from "../src/lib/auth/permissions";
import { generateOrderNumber } from "../src/features/orders/pricing";
import { inspectGltf } from "../src/features/showroom/gltf-inspect";
import { buildGarmentGlb } from "./garment-geometry";

const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }) });
const argon = (p: string) => hash(p, { algorithm: 2, memoryCost: 19456, timeCost: 2, parallelism: 1 });
const token = () => randomBytes(18).toString("base64url");

// Deterministic PRNG so seeds are reproducible.
let seed = 42;
const rand = () => ((seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296);
const pick = <T,>(arr: readonly T[]) => arr[Math.floor(rand() * arr.length)]!;

async function seedAccess() {
  for (const [key, meta] of Object.entries(PERMISSIONS)) {
    await db.permission.upsert({ where: { key }, update: { description: meta.description, group: meta.group }, create: { key, description: meta.description, group: meta.group } });
  }
  const perms = await db.permission.findMany();
  const permId = new Map(perms.map((p) => [p.key, p.id]));
  for (const key of ROLE_KEYS) {
    const def = DEFAULT_ROLES[key];
    const role = await db.role.upsert({
      where: { key },
      update: { name: def.name, description: def.description, isSystem: true },
      create: { key, name: def.name, description: def.description, isSystem: true },
    });
    await db.rolePermission.deleteMany({ where: { roleId: role.id } });
    await db.rolePermission.createMany({ data: def.permissions.map((p) => ({ roleId: role.id, permissionId: permId.get(p)! })) });
  }
  console.log(`✓ ${perms.length} permissions, ${ROLE_KEYS.length} roles`);
}

async function upsertUser(email: string, name: string, password: string, roleKeys: string[], isStaff: boolean) {
  const roles = await db.role.findMany({ where: { key: { in: roleKeys } } });
  const user = await db.user.upsert({
    where: { email },
    update: {},
    create: {
      email,
      name,
      isStaff,
      passwordHash: await argon(password),
      emailVerifiedAt: new Date(),
      profile: { create: { phone: "+254700000000" } },
      wishlist: { create: {} },
    },
  });
  for (const r of roles) {
    await db.userRole.upsert({ where: { userId_roleId: { userId: user.id, roleId: r.id } }, update: {}, create: { userId: user.id, roleId: r.id } });
  }
  return user;
}

const CATEGORIES = [
  { slug: "women", name: "Women", description: "Tailoring, dresses and knitwear for women." },
  { slug: "men", name: "Men", description: "Outerwear, shirting and trousers for men." },
  { slug: "children", name: "Children", description: "Considered pieces for little ones." },
  { slug: "shoes", name: "Shoes", description: "Leather and canvas footwear." },
  { slug: "bags", name: "Bags", description: "Totes, crossbody and travel bags." },
  { slug: "accessories", name: "Accessories", description: "Scarves, belts and small leather goods." },
  { slug: "sportswear", name: "Sportswear", description: "Performance pieces with a clean line." },
  { slug: "luxury", name: "Luxury", description: "Limited atelier pieces in rare fabrics." },
];

const BRANDS = [
  { slug: "maison-ardent", name: "Maison Ardent", description: "Parisian-inspired tailoring cut in small runs.", isFeatured: true },
  { slug: "nord-atelier", name: "Nord Atelier", description: "Scandinavian minimalism in natural fibres.", isFeatured: true },
  { slug: "kaya-studio", name: "Kaya Studio", description: "Nairobi studio known for hand-finished cotton.", isFeatured: true },
  { slug: "lumen-loom", name: "Lumen & Loom", description: "Linen and silk woven in family mills.", isFeatured: true },
  { slug: "oro-sport", name: "Oro Sport", description: "Technical sportswear with an editorial eye.", isFeatured: false },
  { slug: "vela", name: "Vela", description: "Leather goods and accessories.", isFeatured: true },
];

const COLORS = {
  Ink: "#1c1b19", Ivory: "#efe9de", Camel: "#b88a5a", Olive: "#5d6146", Clay: "#9c5b3e", Navy: "#1f2a3c",
  Stone: "#a9a196", Rose: "#c9a19a", Sage: "#9aa58d", Chocolate: "#4b3326", Sky: "#9db4c8", Charcoal: "#3b3a38",
} as const;
type ColorName = keyof typeof COLORS;

interface SeedProduct {
  name: string;
  brand: string;
  category: string;
  kind: GarmentKind;
  price: number;
  sale?: number;
  colors: ColorName[];
  sizes: string[];
  material: string;
  composition: string;
  tags: string[];
  model?: boolean;
  featured?: boolean;
  description: string;
}

const APPAREL = ["XS", "S", "M", "L", "XL"];
const SHOE = ["38", "39", "40", "41", "42", "43"];

const PRODUCTS: SeedProduct[] = [
  { name: "Column Silk Dress", brand: "lumen-loom", category: "women", kind: "DRESS", price: 420, colors: ["Ink", "Rose"], sizes: APPAREL, material: "Mulberry silk", composition: "100% silk", tags: ["silk", "evening"], model: true, featured: true, description: "A floor-skimming column dress cut on the bias so it falls close to the body without clinging. Fully lined, with a concealed side zip." },
  { name: "Wrap Midi Dress", brand: "kaya-studio", category: "women", kind: "DRESS", price: 240, sale: 189, colors: ["Clay", "Olive"], sizes: APPAREL, material: "Cotton poplin", composition: "100% organic cotton", tags: ["cotton", "day"], model: true, description: "A true wrap dress in crisp organic poplin with a deep tie waist and softly gathered skirt." },
  { name: "Double-Faced Wool Coat", brand: "maison-ardent", category: "women", kind: "COAT", price: 890, colors: ["Camel", "Charcoal"], sizes: APPAREL, material: "Double-faced wool", composition: "90% wool, 10% cashmere", tags: ["wool", "outerwear"], model: true, featured: true, description: "Hand-finished double-faced wool with no lining, so the coat drapes lightly. Dropped shoulder, patch pockets and a self-tie belt." },
  { name: "Cropped Boxy Jacket", brand: "nord-atelier", category: "women", kind: "JACKET", price: 360, colors: ["Ivory", "Ink"], sizes: APPAREL, material: "Bouclé", composition: "70% wool, 30% cotton", tags: ["boucle", "tailoring"], model: true, description: "A boxy cropped jacket in textured bouclé with horn buttons and a collarless neckline." },
  { name: "Pleated Wide Trousers", brand: "maison-ardent", category: "women", kind: "TROUSERS", price: 280, colors: ["Stone", "Ink"], sizes: APPAREL, material: "Wool gabardine", composition: "100% wool", tags: ["tailoring"], model: true, description: "High-waisted trousers with double front pleats and a generous wide leg that breaks cleanly over the shoe." },
  { name: "Ribbed Merino Knit", brand: "nord-atelier", category: "women", kind: "KNIT", price: 190, colors: ["Ivory", "Sage", "Charcoal"], sizes: APPAREL, material: "Extra-fine merino", composition: "100% merino wool", tags: ["knit", "merino"], model: true, description: "A close-fitting rib knit in extra-fine merino, warm without bulk and soft enough to wear against the skin." },
  { name: "Bias Satin Skirt", brand: "lumen-loom", category: "women", kind: "SKIRT", price: 210, colors: ["Chocolate", "Ivory"], sizes: APPAREL, material: "Silk satin", composition: "100% silk", tags: ["silk"], model: true, description: "A fluid midi skirt cut on the bias in heavyweight silk satin, with an elasticated back waist." },
  { name: "Poplin Oversized Shirt", brand: "kaya-studio", category: "women", kind: "SHIRT", price: 160, colors: ["Ivory", "Sky"], sizes: APPAREL, material: "Cotton poplin", composition: "100% organic cotton", tags: ["shirting", "cotton"], model: true, description: "An oversized shirt in crisp poplin with dropped shoulders, a curved hem and mother-of-pearl buttons." },
  { name: "Linen Camp Shirt", brand: "lumen-loom", category: "men", kind: "SHIRT", price: 150, colors: ["Ivory", "Olive", "Sky"], sizes: APPAREL, material: "Washed linen", composition: "100% linen", tags: ["linen", "summer"], model: true, featured: true, description: "A relaxed camp-collar shirt in washed European linen that softens with every wear." },
  { name: "Unstructured Blazer", brand: "maison-ardent", category: "men", kind: "JACKET", price: 540, sale: 459, colors: ["Navy", "Stone"], sizes: APPAREL, material: "Wool-linen hopsack", composition: "60% wool, 40% linen", tags: ["tailoring"], model: true, description: "A soft-shouldered, unlined blazer in breathable hopsack for warm-weather tailoring." },
  { name: "Raglan Overcoat", brand: "nord-atelier", category: "men", kind: "COAT", price: 820, colors: ["Charcoal", "Camel"], sizes: APPAREL, material: "Melton wool", composition: "100% wool", tags: ["wool", "outerwear"], model: true, description: "A raglan-sleeved overcoat in dense melton wool with a concealed placket and storm collar." },
  { name: "Heavyweight Tee", brand: "kaya-studio", category: "men", kind: "TOP", price: 65, colors: ["Ivory", "Ink", "Olive"], sizes: APPAREL, material: "Cotton jersey", composition: "100% organic cotton", tags: ["essentials", "cotton"], model: true, description: "A 260gsm tee with a slightly boxy fit, ribbed collar and a garment-dyed finish." },
  { name: "Tapered Chino", brand: "nord-atelier", category: "men", kind: "TROUSERS", price: 170, colors: ["Stone", "Navy", "Olive"], sizes: APPAREL, material: "Cotton twill", composition: "98% cotton, 2% elastane", tags: ["essentials"], model: true, description: "A mid-rise chino with a tapered leg in brushed twill with a touch of stretch." },
  { name: "Cashmere Crewneck", brand: "maison-ardent", category: "men", kind: "KNIT", price: 380, colors: ["Camel", "Navy", "Charcoal"], sizes: APPAREL, material: "Grade-A cashmere", composition: "100% cashmere", tags: ["cashmere", "knit"], model: true, description: "A classic crewneck knitted from grade-A Mongolian cashmere." },
  { name: "Quilted Field Jacket", brand: "oro-sport", category: "men", kind: "JACKET", price: 310, colors: ["Olive", "Ink"], sizes: APPAREL, material: "Recycled nylon", composition: "100% recycled polyamide", tags: ["outerwear", "technical"], model: true, description: "A lightweight quilted jacket with recycled insulation and water-repellent finish." },
  { name: "Kids' Cotton Smock Dress", brand: "kaya-studio", category: "children", kind: "DRESS", price: 70, colors: ["Rose", "Sky"], sizes: ["2Y", "4Y", "6Y", "8Y"], material: "Cotton voile", composition: "100% cotton", tags: ["kids"], model: true, description: "A breezy smock dress with hand-embroidered yoke." },
  { name: "Kids' Knit Cardigan", brand: "nord-atelier", category: "children", kind: "KNIT", price: 85, colors: ["Ivory", "Sage"], sizes: ["2Y", "4Y", "6Y", "8Y"], material: "Merino", composition: "100% merino wool", tags: ["kids", "knit"], model: true, description: "A soft merino cardigan with wooden buttons." },
  { name: "Leather Derby", brand: "vela", category: "shoes", kind: "SHOES", price: 320, colors: ["Ink", "Chocolate"], sizes: SHOE, material: "Calf leather", composition: "Calf leather upper, rubber sole", tags: ["leather"], description: "A Goodyear-welted derby in polished calf leather." },
  { name: "Canvas Court Sneaker", brand: "oro-sport", category: "shoes", kind: "SHOES", price: 140, colors: ["Ivory", "Ink"], sizes: SHOE, material: "Organic canvas", composition: "Canvas upper, natural rubber sole", tags: ["sneakers"], description: "A low-profile court sneaker in heavy organic canvas." },
  { name: "Suede Loafer", brand: "maison-ardent", category: "shoes", kind: "SHOES", price: 360, sale: 290, colors: ["Camel", "Chocolate"], sizes: SHOE, material: "Suede", composition: "Suede upper, leather sole", tags: ["suede"], description: "An unlined suede loafer that moulds to the foot." },
  { name: "Structured Tote", brand: "vela", category: "bags", kind: "BAG", price: 480, colors: ["Ink", "Camel"], sizes: ["ONE SIZE"], material: "Vegetable-tanned leather", composition: "100% leather", tags: ["leather", "tote"], featured: true, description: "A structured tote in vegetable-tanned leather that ages beautifully." },
  { name: "Crescent Shoulder Bag", brand: "vela", category: "bags", kind: "BAG", price: 390, colors: ["Ivory", "Chocolate"], sizes: ["ONE SIZE"], material: "Nappa leather", composition: "100% leather", tags: ["leather"], description: "A soft crescent-shaped shoulder bag in supple nappa." },
  { name: "Weekender Holdall", brand: "nord-atelier", category: "bags", kind: "BAG", price: 420, colors: ["Olive", "Ink"], sizes: ["ONE SIZE"], material: "Waxed canvas", composition: "Waxed cotton canvas, leather trims", tags: ["travel"], description: "A generous holdall in waxed canvas for two-night trips." },
  { name: "Silk Twill Scarf", brand: "lumen-loom", category: "accessories", kind: "ACCESSORY", price: 120, colors: ["Rose", "Navy"], sizes: ["ONE SIZE"], material: "Silk twill", composition: "100% silk", tags: ["silk"], description: "A hand-rolled 90cm square scarf in silk twill." },
  { name: "Leather Belt", brand: "vela", category: "accessories", kind: "ACCESSORY", price: 95, colors: ["Ink", "Chocolate"], sizes: ["S", "M", "L"], material: "Bridle leather", composition: "100% leather, brass buckle", tags: ["leather"], description: "A 3cm bridle leather belt with solid brass buckle." },
  { name: "Merino Beanie", brand: "nord-atelier", category: "accessories", kind: "ACCESSORY", price: 55, colors: ["Charcoal", "Clay"], sizes: ["ONE SIZE"], material: "Merino", composition: "100% merino wool", tags: ["knit"], description: "A rib-knit beanie in soft merino." },
  { name: "Performance Track Jacket", brand: "oro-sport", category: "sportswear", kind: "JACKET", price: 180, colors: ["Ink", "Sky"], sizes: APPAREL, material: "Recycled tricot", composition: "100% recycled polyester", tags: ["sport"], model: true, description: "A track jacket with bonded seams and a stand collar." },
  { name: "Seamless Training Top", brand: "oro-sport", category: "sportswear", kind: "TOP", price: 75, colors: ["Sage", "Ink"], sizes: APPAREL, material: "Seamless knit", composition: "88% nylon, 12% elastane", tags: ["sport"], model: true, description: "A seamless training top with targeted ventilation." },
  { name: "Run Shorts Trouser", brand: "oro-sport", category: "sportswear", kind: "TROUSERS", price: 95, colors: ["Ink", "Olive"], sizes: APPAREL, material: "Ripstop", composition: "100% recycled nylon", tags: ["sport"], model: true, description: "A lightweight tapered jogger in ripstop with a zip pocket." },
  { name: "Atelier Evening Gown", brand: "maison-ardent", category: "luxury", kind: "DRESS", price: 2400, colors: ["Ink", "Chocolate"], sizes: ["XS", "S", "M"], material: "Duchess satin", composition: "100% silk", tags: ["limited", "evening"], model: true, featured: true, description: "A limited-edition gown in duchess satin, hand-finished in our atelier. Numbered edition of 40." },
  { name: "Cashmere Wrap Coat", brand: "maison-ardent", category: "luxury", kind: "COAT", price: 1850, colors: ["Camel", "Ivory"], sizes: ["XS", "S", "M", "L"], material: "Double cashmere", composition: "100% cashmere", tags: ["limited", "cashmere"], model: true, featured: true, description: "A wrap coat in double-faced cashmere with hand-felled seams." },
  { name: "Silk Organza Blouse", brand: "lumen-loom", category: "luxury", kind: "SHIRT", price: 680, colors: ["Ivory", "Ink"], sizes: ["XS", "S", "M", "L"], material: "Silk organza", composition: "100% silk", tags: ["limited", "silk"], model: true, description: "A sheer organza blouse with voluminous sleeves and French seams." },
];

const MEASURE: Record<string, Record<string, number>> = {
  XS: { chest: 82, waist: 64, length: 64 }, S: { chest: 88, waist: 70, length: 66 }, M: { chest: 94, waist: 76, length: 68 },
  L: { chest: 100, waist: 82, length: 70 }, XL: { chest: 106, waist: 88, length: 72 },
};

async function seedCatalogue() {
  if ((await db.product.count()) > 0) {
    console.log("• catalogue already present — skipping");
    return;
  }
  const cats = new Map<string, string>();
  for (const [i, c] of CATEGORIES.entries()) cats.set(c.slug, (await db.category.create({ data: { ...c, sortOrder: i } })).id);
  const brands = new Map<string, string>();
  for (const b of BRANDS) brands.set(b.slug, (await db.brand.create({ data: b })).id);

  const storageDir = path.resolve(process.env.STORAGE_LOCAL_DIR ?? "./storage");
  const now = Date.now();
  const created: { id: string; kind: GarmentKind; slug: string }[] = [];

  for (const [i, p] of PRODUCTS.entries()) {
    const slug = p.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
    const product = await db.product.create({
      data: {
        name: p.name,
        slug,
        description: p.description,
        brandId: brands.get(p.brand)!,
        categoryId: cats.get(p.category)!,
        status: "PUBLISHED",
        isFeatured: !!p.featured,
        garmentKind: p.kind,
        priceCents: p.price * 100,
        salePriceCents: p.sale ? p.sale * 100 : null,
        material: p.material,
        fabricComposition: p.composition,
        careInstructions: p.composition.includes("silk") || p.composition.includes("cashmere") ? "Dry clean only. Store folded in the dust bag provided." : "Machine wash cold on a gentle cycle. Reshape and dry flat. Cool iron.",
        measurements: p.sizes.every((s) => MEASURE[s]) ? Object.fromEntries(p.sizes.map((s) => [s, MEASURE[s]!])) : undefined,
        specifications: [
          { label: "Fit", value: pick(["Relaxed", "True to size", "Slim", "Oversized"]) },
          { label: "Origin", value: pick(["Made in Kenya", "Made in Portugal", "Made in Italy", "Made in Lithuania"]) },
          { label: "Closure", value: pick(["Buttons", "Concealed zip", "Pull-on", "Tie"]) },
        ],
        tags: p.tags,
        seoTitle: `${p.name} | Atelier`,
        seoDescription: p.description.slice(0, 155),
        publishedAt: new Date(now - i * 2.3 * 86400_000),
        ratingAvg: 0,
      },
    });
    created.push({ id: product.id, kind: p.kind, slug });
    for (const color of p.colors) {
      for (const size of p.sizes) {
        const sku = `${slug.split("-").map((w) => w[0]).join("").toUpperCase()}-${i}-${color.slice(0, 3).toUpperCase()}-${size.replace(/\s/g, "")}`;
        const qty = Math.floor(rand() * 18) + (rand() < 0.12 ? 0 : 2);
        const variant = await db.productVariant.create({ data: { productId: product.id, sku, size, color, colorHex: COLORS[color] } });
        const inv = await db.inventory.create({ data: { variantId: variant.id, quantity: qty, lowStockThreshold: 3 } });
        if (qty) await db.inventoryMovement.create({ data: { inventoryId: inv.id, type: "RESTOCK", quantity: qty, balance: qty, reason: "Initial stock" } });
      }
    }
    if (p.model) {
      const glb = await buildGarmentGlb(p.kind, COLORS[p.colors[0]!]);
      const key = `models/seed/${slug}.glb`;
      await mkdir(path.join(storageDir, "models/seed"), { recursive: true });
      await writeFile(path.join(storageDir, key), glb);
      const report = inspectGltf(glb);
      await db.productModel3D.create({
        data: {
          productId: product.id,
          name: `${p.name} (procedural)`,
          fileKey: key,
          url: `/media/${key}`,
          format: "glb",
          fileSize: glb.byteLength,
          status: report.valid ? "READY" : "REJECTED",
          triangleCount: report.triangleCount,
          meshCount: report.meshCount,
          materialCount: report.materialCount,
          textureCount: report.textureCount,
          textureInfo: report.textures,
          boundingBox: report.boundingBox ?? undefined,
          compatibility: { score: report.score, extensions: report.extensionsUsed, issues: report.issues } as object,
          processedAt: new Date(),
        },
      });
    }
  }
  console.log(`✓ ${PRODUCTS.length} products with variants, inventory and ${PRODUCTS.filter((p) => p.model).length} GLB models`);

  const collections = [
    { slug: "autumn-edit", name: "The Autumn Edit", description: "Wool, cashmere and a palette of camel and charcoal.", match: (p: SeedProduct) => ["COAT", "KNIT"].includes(p.kind) },
    { slug: "linen-story", name: "The Linen Story", description: "Washed linens and silks for long, warm days.", match: (p: SeedProduct) => /linen|silk/i.test(p.material) },
    { slug: "atelier-limited", name: "Atelier Limited", description: "Numbered pieces made in small runs in our studio.", match: (p: SeedProduct) => p.category === "luxury" },
    { slug: "everyday-essentials", name: "Everyday Essentials", description: "The pieces you reach for every morning.", match: (p: SeedProduct) => p.tags.includes("essentials") || p.price < 120 },
  ];
  for (const [i, c] of collections.entries()) {
    const col = await db.collection.create({ data: { slug: c.slug, name: c.name, description: c.description, isFeatured: true, sortOrder: i } });
    const members = PRODUCTS.map((p, idx) => ({ p, id: created[idx]!.id })).filter(({ p }) => c.match(p));
    await db.collectionProduct.createMany({ data: members.map((m, j) => ({ collectionId: col.id, productId: m.id, sortOrder: j })) });
  }
  console.log("✓ collections");
}

async function seedContent() {
  if ((await db.contentBlock.count()) > 0) return;
  await db.contentBlock.createMany({
    data: [
      { type: "HERO", placement: "home.hero", title: "Walk the rail.", subtitle: "Autumn / Winter 2026", body: "Browse the collection the way you would in the studio — slide along the rail, lift a piece off, turn it in your hands.", ctaLabel: "Enter the showroom", ctaHref: "/showroom", sortOrder: 0 },
      { type: "PROMOTION", placement: "home.promo", title: "10% off your first order", subtitle: "Use code WELCOME10 at checkout", ctaLabel: "Shop new arrivals", ctaHref: "/new-arrivals", sortOrder: 0 },
      { type: "BANNER", placement: "home.banner", title: "Complimentary delivery over $250", subtitle: "Free returns within 30 days", sortOrder: 0 },
      { type: "EDITORIAL", placement: "home.editorial", title: "Made slowly, worn for years", subtitle: "From the studio", body: "Every Atelier piece is cut in small runs by partner workshops in Nairobi, Porto and Biella. We publish the origin of every garment and pay for the time good clothing takes.", ctaLabel: "Our story", ctaHref: "/about", sortOrder: 0 },
      { type: "TESTIMONIAL", placement: "home.testimonials", title: "Wanjiru M.", body: "Being able to turn the coat around and zoom into the weave before buying was the reason I ordered. It arrived exactly as I'd seen it.", data: { location: "Nairobi" }, sortOrder: 0 },
      { type: "TESTIMONIAL", placement: "home.testimonials", title: "Elise D.", body: "The most considered online shop I've used. Delivery was quick and the packaging was beautiful.", data: { location: "Lyon" }, sortOrder: 1 },
      { type: "TESTIMONIAL", placement: "home.testimonials", title: "Tomás R.", body: "The showroom rail is genuinely fun — I found a blazer I would have scrolled past.", data: { location: "Lisbon" }, sortOrder: 2 },
    ],
  });
  await db.navigationLink.createMany({
    data: [
      { label: "Shipping & returns", href: "/about#shipping", location: "FOOTER", group: "Help", sortOrder: 0 },
      { label: "Size guide", href: "/about#sizing", location: "FOOTER", group: "Help", sortOrder: 1 },
      { label: "Contact", href: "/about#contact", location: "FOOTER", group: "Help", sortOrder: 2 },
      { label: "Our story", href: "/about", location: "FOOTER", group: "Atelier", sortOrder: 0 },
      { label: "3D Showroom", href: "/showroom", location: "FOOTER", group: "Atelier", sortOrder: 1 },
      { label: "Collections", href: "/collections", location: "FOOTER", group: "Atelier", sortOrder: 2 },
    ],
  });
  await db.coupon.createMany({
    data: [
      { code: "WELCOME10", description: "10% off your first order", type: "PERCENTAGE", value: 10, perUserLimit: 1 },
      { code: "FREESHIP", description: "Free standard delivery", type: "FREE_SHIPPING", value: 0 },
      { code: "SAVE25", description: "$25 off orders over $200", type: "FIXED", value: 2500, minSubtotalCents: 20000 },
    ],
  });
  console.log("✓ content, navigation, coupons");
}

async function seedHistory() {
  if ((await db.order.count()) > 0) return;
  const customers: string[] = [];
  const firstNames = ["Amani", "Zuri", "Liam", "Noor", "Kofi", "Maya", "Jonas", "Imani", "Leah", "Omar", "Sofia", "Baraka"];
  for (let i = 0; i < 24; i++) {
    const name = `${firstNames[i % firstNames.length]} ${String.fromCharCode(65 + (i % 26))}.`;
    const u = await db.user.create({
      data: {
        email: `shopper${i + 1}@example.com`,
        name,
        emailVerifiedAt: new Date(),
        createdAt: new Date(Date.now() - Math.floor(rand() * 60) * 86400_000),
        profile: { create: {} },
        wishlist: { create: {} },
        roles: { create: { role: { connect: { key: "CUSTOMER" } } } },
      },
    });
    customers.push(u.id);
  }
  const variants = await db.productVariant.findMany({ include: { product: true, inventory: true } });
  let orders = 0;
  for (let day = 59; day >= 0; day--) {
    const date = new Date(Date.now() - day * 86400_000);
    const visitors = 20 + Math.floor(rand() * 40);
    await db.analyticsEvent.createMany({
      data: Array.from({ length: visitors }, (_, i) => ({ type: "SESSION_START" as const, visitorId: `v-${day}-${i}`, createdAt: date })),
    });
    await db.analyticsEvent.createMany({
      data: Array.from({ length: visitors * 2 }, (_, i) => ({ type: "PRODUCT_VIEW" as const, visitorId: `v-${day}-${i % visitors}`, productId: pick(variants).productId, createdAt: date })),
    });
    const count = Math.floor(rand() * 3) + (day % 7 === 5 ? 2 : 0);
    for (let n = 0; n < count; n++) {
      const userId = pick(customers);
      const lines = Array.from({ length: 1 + Math.floor(rand() * 2) }, () => pick(variants.filter((v) => (v.inventory?.quantity ?? 0) > 2)));
      const subtotal = lines.reduce((s, v) => s + (v.product.salePriceCents ?? v.product.priceCents), 0);
      const shipping = subtotal >= 25000 ? 0 : 800;
      const tax = Math.round(subtotal * 0.16);
      const status = day > 10 ? "DELIVERED" : day > 4 ? "SHIPPED" : day > 1 ? "PROCESSING" : "PAID";
      const user = await db.user.findUniqueOrThrow({ where: { id: userId } });
      const order = await db.order.create({
        data: {
          number: generateOrderNumber(date, rand),
          userId,
          email: user.email,
          customerName: user.name ?? "Customer",
          phone: "+254711000000",
          status,
          paymentStatus: "PAID",
          currency: process.env.STORE_CURRENCY ?? "USD",
          subtotalCents: subtotal,
          shippingCents: shipping,
          taxCents: tax,
          totalCents: subtotal + shipping + tax,
          shippingMethod: "standard",
          shippingAddress: { fullName: user.name, phone: "+254711000000", line1: "12 Riverside Drive", city: "Nairobi", country: "KE" },
          idempotencyKey: `seed-${day}-${n}-${token()}`,
          placedAt: date,
          paidAt: date,
          items: {
            create: lines.map((v) => ({
              productId: v.productId,
              variantId: v.id,
              productName: v.product.name,
              variantLabel: `${v.color} / ${v.size}`,
              sku: v.sku,
              unitPriceCents: v.product.salePriceCents ?? v.product.priceCents,
              quantity: 1,
              totalCents: v.product.salePriceCents ?? v.product.priceCents,
            })),
          },
          payments: { create: { provider: "SANDBOX", status: "SUCCEEDED", amountCents: subtotal + shipping + tax, currency: process.env.STORE_CURRENCY ?? "USD", idempotencyKey: `seed-pay-${token()}`, providerReference: `sbx_seed_${token()}`, succeededAt: date } },
        },
      });
      const path = ["PENDING_PAYMENT", "PAID", "PROCESSING", "SHIPPED", "DELIVERED"] as const;
      const until = path.indexOf(status);
      for (let s = 0; s <= until; s++) {
        await db.orderStatusHistory.create({ data: { orderId: order.id, fromStatus: s ? path[s - 1] : null, toStatus: path[s]!, createdAt: new Date(date.getTime() + s * 3600_000) } });
      }
      if (until >= 3) await db.shipment.create({ data: { orderId: order.id, carrier: "Sendy", trackingNumber: `SND${Math.floor(rand() * 1e8)}`, status: until === 4 ? "DELIVERED" : "IN_TRANSIT", shippedAt: date } });
      for (const v of lines) {
        const inv = await db.inventory.update({ where: { variantId: v.id }, data: { quantity: { decrement: 1 } } });
        await db.inventoryMovement.create({ data: { inventoryId: inv.id, type: "SALE", quantity: -1, balance: inv.quantity, referenceId: order.id, createdAt: date } });
        await db.product.update({ where: { id: v.productId }, data: { salesCount: { increment: 1 } } });
      }
      await db.analyticsEvent.create({ data: { type: "ORDER_PLACED", visitorId: `v-${day}-${n}`, userId, createdAt: date } });
      orders++;
    }
  }
  // Approved reviews on a handful of products.
  const products = await db.product.findMany({ take: 12, orderBy: { salesCount: "desc" } });
  const bodies = ["Beautiful fabric and the fit is spot on.", "Exactly as shown in the 3D view — lovely drape.", "Runs slightly large, size down if between sizes.", "Quality is exceptional for the price."];
  for (const p of products) {
    const reviewers = customers.slice(0, 2 + Math.floor(rand() * 3));
    for (const r of reviewers) {
      await db.review.create({ data: { productId: p.id, userId: r, rating: 4 + Math.round(rand()), title: pick(["Love it", "Gorgeous", "Great quality", "Perfect fit"]), body: pick(bodies), status: "APPROVED", verifiedPurchase: true } });
    }
    const agg = await db.review.aggregate({ where: { productId: p.id }, _avg: { rating: true }, _count: { _all: true } });
    await db.product.update({ where: { id: p.id }, data: { ratingAvg: agg._avg.rating ?? 0, ratingCount: agg._count._all } });
  }
  console.log(`✓ ${customers.length} customers, ${orders} historical orders, analytics events, reviews`);
}

async function main() {
  await seedAccess();
  const adminEmail = process.env.SEED_ADMIN_EMAIL ?? "admin@atelier.local";
  const adminPassword = process.env.SEED_ADMIN_PASSWORD ?? "Atelier-Admin-2026";
  await upsertUser(adminEmail, "Studio Admin", adminPassword, ["SUPER_ADMIN"], true);
  await upsertUser("inventory@atelier.local", "Inventory Lead", adminPassword, ["INVENTORY_MANAGER"], true);
  await upsertUser("support@atelier.local", "Support Agent", adminPassword, ["CUSTOMER_SUPPORT"], true);
  await upsertUser("customer@atelier.local", "Demo Customer", "Customer-Demo-2026", ["CUSTOMER"], false);
  console.log(`✓ staff (${adminEmail}) and demo customer (customer@atelier.local)`);
  await seedCatalogue();
  await seedContent();
  await seedHistory();
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
