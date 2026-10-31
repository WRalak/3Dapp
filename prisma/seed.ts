/**
 * Development seed for the 3Dapp marketplace: roles/permissions, staff, the 47 counties,
 * Kenyan sellers in Nairobi, Mombasa, Kisumu, Nakuru, Eldoret and Thika with delivery zones,
 * a KES catalogue with variants/stock, illustrative GLB silhouettes, campaigns, coupons and
 * ~60 days of multi-seller order history settled through the real finance ledger.
 *
 *   npm run db:seed            (idempotent for roles/permissions/counties; catalogue seeded once)
 *
 * Runs with tsconfig.worker.json so it can reuse server services (ledger settlement).
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
import { KENYA_COUNTIES, countySlug } from "../src/features/delivery/counties";
import { settlePaidOrder, releaseDueEarnings } from "../src/server/services/finance.service";
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


// ─── Reference data ──────────────────────────────────────────────────────────

async function seedCounties() {
  for (const c of KENYA_COUNTIES) {
    await db.county.upsert({ where: { code: c.code }, update: { name: c.name }, create: { code: c.code, name: c.name, slug: countySlug(c.name) } });
  }
  console.log(`✓ ${KENYA_COUNTIES.length} counties`);
}

const CATEGORIES = [
  { slug: "women", name: "Women", description: "Dresses, tailoring and everyday pieces from Kenyan designers." },
  { slug: "men", name: "Men", description: "Shirts, suits and casualwear cut in Kenya." },
  { slug: "ankara", name: "Ankara & Kitenge", description: "Wax-print and kitenge pieces — bold prints, contemporary cuts.", commissionRateBps: 1200 },
  { slug: "modest", name: "Modest wear", description: "Abayas, long dresses and coordinated sets." },
  { slug: "occasion", name: "Occasion & bridal", description: "Ruracio, wedding and celebration outfits." },
  { slug: "traditional", name: "Traditional & cultural", description: "Pieces drawing on Kenyan textile traditions, made by Kenyan artisans." },
  { slug: "children", name: "Children", description: "Matching sets and playful prints for little ones." },
  { slug: "shoes", name: "Shoes & sandals", description: "Handmade leather shoes and sandals." },
  { slug: "bags", name: "Bags", description: "Leather, sisal and canvas bags." },
  { slug: "accessories", name: "Accessories", description: "Beadwork, scarves and small leather goods.", commissionRateBps: 1000 },
];

const COLORS = {
  Ink: "#1c1b19", Ivory: "#efe9de", Ochre: "#c8892f", Indigo: "#2c3e6b", Terracotta: "#b25a3c", Forest: "#2f5a3f",
  Saffron: "#e0a526", Coral: "#e07a5f", Sand: "#d9c7a7", Tan: "#a8713f", Plum: "#5e2b4a", Teal: "#1f6f73", White: "#f5f3ee", Black: "#151515",
} as const;
type ColorName = keyof typeof COLORS;

interface SeedSeller {
  key: string;
  businessName: string;
  businessType: "DESIGNER" | "BOUTIQUE" | "BRAND" | "MANUFACTURER";
  county: string;
  town: string;
  description: string;
  categories: string[];
  featured?: boolean;
  commissionRateBps?: number;
  sameDay?: boolean;
  pickup: string;
}

const SELLERS: SeedSeller[] = [
  { key: "kitenge-house", businessName: "Kitenge House", businessType: "DESIGNER", county: "Nairobi", town: "Westlands", featured: true, sameDay: true, pickup: "Sarit Centre, Westlands (2nd floor studio)", categories: ["ankara", "women", "men"], description: "Contemporary kitenge and Ankara tailoring from a Westlands studio. Every print is chosen by hand at Gikomba and cut in small runs by our team of six tailors." },
  { key: "pwani-threads", businessName: "Pwani Threads", businessType: "BOUTIQUE", county: "Mombasa", town: "Nyali", featured: true, sameDay: true, pickup: "Nyali Centre, shop 14", categories: ["women", "men", "modest"], description: "Breathable coastal fashion — linen, cotton kikoi and light kaftans made for Mombasa heat. Woven and sewn along the coast." },
  { key: "lakeside-atelier", businessName: "Lakeside Atelier", businessType: "DESIGNER", county: "Kisumu", town: "Milimani", featured: true, pickup: "Milimani Road, Kisumu", categories: ["occasion", "women"], description: "Occasion wear and bridal pieces from Kisumu. Made-to-measure available — message us with your measurements and date." },
  { key: "rift-tailors", businessName: "Rift Tailors", businessType: "MANUFACTURER", county: "Nakuru", town: "Nakuru CBD", pickup: "Kenyatta Avenue, Nakuru", categories: ["men", "children"], description: "A family tailoring workshop in Nakuru since 1998: sharp men's shirting, school-ready children's sets and honest prices." },
  { key: "eldoret-leatherworks", businessName: "Eldoret Leatherworks", businessType: "MANUFACTURER", county: "Uasin Gishu", town: "Eldoret", featured: true, commissionRateBps: 1000, pickup: "Uganda Road, Eldoret", categories: ["shoes", "bags", "accessories"], description: "Hand-cut, hand-stitched leather shoes, sandals and bags using hides tanned in Kenya." },
  { key: "thika-modest", businessName: "Thika Modest Studio", businessType: "BOUTIQUE", county: "Kiambu", town: "Thika", pickup: "Thika Arcade, ground floor", categories: ["modest", "women"], description: "Elegant modest wear — abayas, long dresses and coordinated hijab sets, designed in Thika." },
];

interface SeedProduct {
  name: string;
  seller: string;
  category: string;
  kind: GarmentKind;
  price: number; // KES
  sale?: number;
  colors: ColorName[];
  sizes: string[];
  material: string;
  composition: string;
  tags: string[];
  collections: string[];
  model?: boolean;
  featured?: boolean;
  description: string;
}

const APPAREL = ["S", "M", "L", "XL"];
const SHOE = ["38", "39", "40", "41", "42", "43", "44"];
const KIDS = ["2-3Y", "4-5Y", "6-7Y", "8-9Y"];

const PRODUCTS: SeedProduct[] = [
  { name: "Ankara Wrap Midi Dress", seller: "kitenge-house", category: "ankara", kind: "DRESS", price: 6500, colors: ["Ochre", "Indigo"], sizes: APPAREL, material: "Cotton wax print", composition: "100% cotton", tags: ["ankara", "wrap", "day"], collections: ["contemporary-ankara", "kenyan-designers", "nairobi-street-style"], model: true, featured: true, description: "A true wrap dress in bold wax-print cotton with a deep tie waist and a flowing midi skirt. Each piece is cut individually, so print placement varies." },
  { name: "Kitenge Shirt — Short Sleeve", seller: "kitenge-house", category: "ankara", kind: "SHIRT", price: 3800, sale: 3200, colors: ["Terracotta", "Teal"], sizes: APPAREL, material: "Kitenge cotton", composition: "100% cotton", tags: ["kitenge", "shirt"], collections: ["contemporary-ankara", "made-in-kenya"], model: true, description: "Our best-selling camp-collar shirt in kitenge cotton. Relaxed fit with a straight hem you can wear untucked to the office or a Saturday lunch." },
  { name: "Ankara Bomber Jacket", seller: "kitenge-house", category: "ankara", kind: "JACKET", price: 8900, colors: ["Saffron", "Indigo"], sizes: APPAREL, material: "Wax print with cotton lining", composition: "100% cotton", tags: ["ankara", "streetwear"], collections: ["nairobi-street-style", "contemporary-ankara"], model: true, featured: true, description: "A lined bomber in statement wax print with ribbed cuffs. Built for Nairobi evenings." },
  { name: "Kitenge Wide-Leg Trousers", seller: "kitenge-house", category: "women", kind: "TROUSERS", price: 4800, colors: ["Coral", "Forest"], sizes: APPAREL, material: "Kitenge cotton", composition: "100% cotton", tags: ["kitenge", "trousers"], collections: ["contemporary-ankara", "nairobi-street-style"], model: true, description: "High-waisted wide-leg trousers with side pockets and an elasticated back waist." },
  { name: "Two-Piece Ankara Set", seller: "kitenge-house", category: "ankara", kind: "TOP", price: 7200, colors: ["Plum", "Ochre"], sizes: APPAREL, material: "Cotton wax print", composition: "100% cotton", tags: ["ankara", "set"], collections: ["contemporary-ankara"], model: true, description: "A cropped peplum top and matching midi skirt — wear together or style separately." },
  { name: "Linen Kaftan", seller: "pwani-threads", category: "women", kind: "DRESS", price: 5400, colors: ["White", "Sand"], sizes: ["S/M", "L/XL"], material: "Washed linen", composition: "100% linen", tags: ["linen", "coast", "resort"], collections: ["coastal-fashion", "made-in-kenya"], model: true, featured: true, description: "A loose, breezy kaftan in washed linen with hand-finished neckline. Made for Mombasa afternoons." },
  { name: "Kikoi Beach Shirt", seller: "pwani-threads", category: "men", kind: "SHIRT", price: 3500, colors: ["Teal", "Saffron"], sizes: APPAREL, material: "Cotton kikoi", composition: "100% cotton", tags: ["kikoi", "coast"], collections: ["coastal-fashion", "african-heritage"], model: true, description: "A lightweight shirt woven on the coast in classic striped kikoi cotton." },
  { name: "Linen Drawstring Trousers", seller: "pwani-threads", category: "men", kind: "TROUSERS", price: 4200, sale: 3600, colors: ["Sand", "Ivory"], sizes: APPAREL, material: "Linen", composition: "100% linen", tags: ["linen", "coast"], collections: ["coastal-fashion"], model: true, description: "Relaxed linen trousers with a drawstring waist and tapered leg." },
  { name: "Kanga-Print Maxi Skirt", seller: "pwani-threads", category: "women", kind: "SKIRT", price: 3900, colors: ["Coral", "Indigo"], sizes: APPAREL, material: "Cotton voile", composition: "100% cotton", tags: ["kanga", "coast"], collections: ["coastal-fashion", "african-heritage"], model: true, description: "A tiered maxi skirt in a kanga-inspired print, designed and printed in Mombasa." },
  { name: "Coastal Linen Abaya", seller: "pwani-threads", category: "modest", kind: "COAT", price: 6800, colors: ["Black", "Sand"], sizes: ["52", "54", "56", "58"], material: "Linen blend", composition: "55% linen, 45% viscose", tags: ["abaya", "modest"], collections: ["coastal-fashion"], model: true, description: "An open abaya in a light linen blend with subtle embroidered cuffs." },
  { name: "Ruracio Gown", seller: "lakeside-atelier", category: "occasion", kind: "DRESS", price: 18500, colors: ["Teal", "Plum"], sizes: ["S", "M", "L"], material: "Satin with kitenge panels", composition: "Polyester satin, cotton panels", tags: ["occasion", "bridal"], collections: ["kenyan-designers"], model: true, featured: true, description: "A floor-length satin gown with kitenge panelling for ruracio and wedding celebrations. Made to order in 10 days; message us for custom sizing." },
  { name: "Occasion Peplum Top", seller: "lakeside-atelier", category: "occasion", kind: "TOP", price: 5600, colors: ["Ochre", "Black"], sizes: APPAREL, material: "Brocade", composition: "Polyester brocade", tags: ["occasion"], collections: ["kenyan-designers"], model: true, description: "A structured brocade peplum top for weddings and graduations." },
  { name: "Tailored Kitenge Blazer", seller: "lakeside-atelier", category: "women", kind: "JACKET", price: 9800, colors: ["Indigo", "Terracotta"], sizes: APPAREL, material: "Kitenge with satin lining", composition: "100% cotton shell", tags: ["tailoring", "kitenge"], collections: ["contemporary-ankara", "kenyan-designers"], model: true, description: "A single-breasted blazer in kitenge, fully lined, with a nipped waist." },
  { name: "Men's Slim Office Shirt", seller: "rift-tailors", category: "men", kind: "SHIRT", price: 2400, colors: ["White", "Indigo", "Sand"], sizes: ["15", "15.5", "16", "16.5", "17"], material: "Cotton poplin", composition: "100% cotton", tags: ["office", "essentials"], collections: ["made-in-kenya"], model: true, description: "A crisp poplin shirt with a cutaway collar and double-stitched seams. Sized by collar." },
  { name: "Two-Piece Wool-Blend Suit", seller: "rift-tailors", category: "men", kind: "JACKET", price: 16500, sale: 14500, colors: ["Black", "Indigo"], sizes: ["46", "48", "50", "52"], material: "Wool blend", composition: "65% polyester, 35% wool", tags: ["suit", "tailoring"], collections: ["made-in-kenya"], model: true, featured: true, description: "A two-button suit with flat-front trousers. Free hemming at our Nakuru workshop." },
  { name: "Chino Trousers", seller: "rift-tailors", category: "men", kind: "TROUSERS", price: 2900, colors: ["Sand", "Forest", "Black"], sizes: ["30", "32", "34", "36", "38"], material: "Cotton twill", composition: "98% cotton, 2% elastane", tags: ["essentials"], collections: ["nairobi-street-style"], model: true, description: "Everyday chinos in stretch twill with a tapered leg." },
  { name: "Kids' Kitenge Set", seller: "rift-tailors", category: "children", kind: "TOP", price: 2200, colors: ["Saffron", "Teal"], sizes: KIDS, material: "Kitenge cotton", composition: "100% cotton", tags: ["kids", "kitenge"], collections: ["african-heritage"], model: true, description: "A matching shirt-and-shorts set in soft kitenge cotton for family occasions." },
  { name: "Leather Akala-Style Sandals", seller: "eldoret-leatherworks", category: "shoes", kind: "SHOES", price: 2800, colors: ["Tan", "Black"], sizes: SHOE, material: "Full-grain leather", composition: "Leather straps, recycled-tyre sole", tags: ["sandals", "leather"], collections: ["african-heritage", "made-in-kenya"], description: "Hard-wearing leather sandals on a recycled-tyre sole, inspired by the classic Kenyan akala." },
  { name: "Handstitched Leather Brogues", seller: "eldoret-leatherworks", category: "shoes", kind: "SHOES", price: 7900, colors: ["Tan", "Black"], sizes: SHOE, material: "Calf leather", composition: "Leather upper and sole", tags: ["leather", "formal"], collections: ["made-in-kenya"], featured: true, description: "Blake-stitched brogues cut from Kenyan-tanned calf leather." },
  { name: "Leather Weekender Bag", seller: "eldoret-leatherworks", category: "bags", kind: "BAG", price: 12500, colors: ["Tan"], sizes: ["ONE SIZE"], material: "Full-grain leather", composition: "Leather, cotton lining, brass hardware", tags: ["leather", "travel"], collections: ["made-in-kenya"], description: "A roomy weekender with brass hardware and a detachable strap." },
  { name: "Sisal Kiondo Tote", seller: "eldoret-leatherworks", category: "bags", kind: "BAG", price: 3200, colors: ["Ochre", "Teal"], sizes: ["ONE SIZE"], material: "Sisal and leather", composition: "Hand-woven sisal, leather handles", tags: ["kiondo", "handwoven"], collections: ["african-heritage", "made-in-kenya"], description: "A hand-woven kiondo basket bag with leather handles, made in partnership with a women's weaving group in Machakos." },
  { name: "Beaded Leather Belt", seller: "eldoret-leatherworks", category: "accessories", kind: "ACCESSORY", price: 1800, colors: ["Black", "Tan"], sizes: ["S", "M", "L"], material: "Leather and glass beads", composition: "Leather, glass beads", tags: ["beadwork"], collections: ["african-heritage"], description: "A leather belt with hand-applied beadwork by artisans in Kajiado." },
  { name: "Chiffon Maxi Abaya", seller: "thika-modest", category: "modest", kind: "DRESS", price: 5900, colors: ["Black", "Plum", "Teal"], sizes: ["52", "54", "56", "58"], material: "Chiffon with crepe lining", composition: "100% polyester", tags: ["abaya", "modest"], collections: ["kenyan-designers"], model: true, featured: true, description: "A flowing two-layer abaya with pleated sleeves and a matching belt." },
  { name: "Jersey Hijab Set (3 pack)", seller: "thika-modest", category: "modest", kind: "ACCESSORY", price: 1500, colors: ["Sand", "Black"], sizes: ["ONE SIZE"], material: "Viscose jersey", composition: "95% viscose, 5% elastane", tags: ["hijab", "modest"], collections: [], description: "Three soft jersey hijabs in coordinating tones. Breathable and non-slip." },
  { name: "Modest Wide-Leg Co-ord", seller: "thika-modest", category: "modest", kind: "TROUSERS", price: 4600, sale: 3900, colors: ["Forest", "Sand"], sizes: APPAREL, material: "Crepe", composition: "100% polyester crepe", tags: ["modest", "co-ord"], collections: ["nairobi-street-style"], model: true, description: "A longline tunic and wide-leg trouser co-ord in fluid crepe." },
  { name: "Long-Sleeve Midi Dress", seller: "thika-modest", category: "women", kind: "DRESS", price: 4400, colors: ["Indigo", "Coral"], sizes: APPAREL, material: "Viscose", composition: "100% viscose", tags: ["modest", "day"], collections: [], model: true, description: "A long-sleeve tiered midi dress with a high neckline." },
  { name: "3Dapp Essential Tee", seller: "house-seller", category: "men", kind: "TOP", price: 1500, colors: ["White", "Black", "Forest"], sizes: APPAREL, material: "Cotton jersey", composition: "100% Kenyan-grown cotton", tags: ["essentials"], collections: ["made-in-kenya"], model: true, description: "A heavyweight tee knitted and sewn in Kenya from Kenyan-grown cotton." },
];

const MEASURE: Record<string, Record<string, number>> = {
  S: { chest: 88, waist: 70, length: 66 }, M: { chest: 94, waist: 76, length: 68 }, L: { chest: 100, waist: 82, length: 70 }, XL: { chest: 106, waist: 88, length: 72 },
};

const COLLECTIONS = [
  { slug: "nairobi-street-style", name: "Nairobi Street Style", description: "What Nairobi is wearing right now — bold, practical and made for the city." },
  { slug: "african-heritage", name: "African Heritage", description: "Kikoi, kanga, beadwork and kiondo — Kenyan textile traditions in the hands of the artisans who carry them on." },
  { slug: "coastal-fashion", name: "Coastal Fashion", description: "Linen, cotton and easy shapes from Mombasa and the coast." },
  { slug: "contemporary-ankara", name: "Contemporary Ankara", description: "Wax print and kitenge, cut in modern silhouettes." },
  { slug: "made-in-kenya", name: "Made in Kenya", description: "Designed, cut and sewn in Kenya." },
  { slug: "kenyan-designers", name: "Kenyan Designers", description: "Independent designers to know, from Westlands to Milimani." },
];

// ─── Sellers & catalogue ──────────────────────────────────────────────────────

async function seedSellers(adminId: string, password: string) {
  const counties = new Map((await db.county.findMany()).map((c) => [c.name, c.id]));
  const allCountyIds = [...counties.values()];
  // The migration created the house store; give it to the platform admin and a proper profile.
  // (Fresh databases don't have it — the migration only creates it to own pre-existing products.)
  const house = { ownerId: adminId, businessName: "3Dapp Select", slug: "3dapp-select", status: "APPROVED" as const, countyId: counties.get("Nairobi"), town: "Nairobi CBD", approvedAt: new Date() };
  const houseProfile = { contactName: "3Dapp", email: "care@3dapp.example", phone: "+254700000000", description: "3Dapp's own essentials, made in Kenya.", categories: ["men", "women"] };
  const otherOwned = await db.seller.findFirst({ where: { ownerId: adminId, id: { not: "house-seller" } } });
  if (otherOwned) throw new Error("Seed admin already owns a different seller");
  await db.seller.upsert({ where: { id: "house-seller" }, update: house, create: { id: "house-seller", ...house, profile: { create: houseProfile }, wallet: { create: {} } } });
  await db.sellerProfile.upsert({ where: { sellerId: "house-seller" }, update: houseProfile, create: { sellerId: "house-seller", ...houseProfile } });
  await db.sellerWallet.upsert({ where: { sellerId: "house-seller" }, update: {}, create: { sellerId: "house-seller" } });

  const ids = new Map<string, string>([["house-seller", "house-seller"]]);
  for (const [i, s] of SELLERS.entries()) {
    const owner = await upsertUser(`${s.key}@sellers.3dapp.test`, `${s.businessName} owner`, password, ["CUSTOMER", "SELLER"], false);
    const countyId = counties.get(s.county)!;
    const existing = await db.seller.findUnique({ where: { slug: s.key } });
    const seller =
      existing ??
      (await db.seller.create({
        data: {
          ownerId: owner.id,
          slug: s.key,
          businessName: s.businessName,
          businessType: s.businessType,
          status: "APPROVED",
          countyId,
          town: s.town,
          isFeatured: !!s.featured,
          commissionRateBps: s.commissionRateBps ?? null,
          approvedAt: new Date(Date.now() - (90 - i * 7) * 86400_000),
          followerCount: 0,
          profile: {
            create: {
              contactName: `${s.businessName} team`,
              email: `${s.key}@sellers.3dapp.test`,
              phone: `+2547120000${String(i).padStart(2, "0")}`,
              description: s.description,
              categories: s.categories,
              payoutMethod: "MPESA",
              payoutMpesaPhone: `+2547120000${String(i).padStart(2, "0")}`,
              returnPolicy: "Exchanges within 7 days of delivery for unworn items with tags. Made-to-order pieces are final sale.",
            },
          },
          wallet: { create: {} },
          verifications: { create: [{ decision: "SUBMITTED" }, { decision: "APPROVED", reviewerId: adminId, notes: "Documents verified" }] },
          brands: { create: { name: s.businessName, slug: `${s.key}-label`, description: s.description.split(".")[0] } },
        },
      }));
    ids.set(s.key, seller.id);
    if (!existing) {
      // Home zone: same-day/next-day locally; countrywide courier for everyone else; studio pickup.
      await db.deliveryZone.create({
        data: {
          sellerId: seller.id,
          name: `${s.county} County`,
          counties: { create: { countyId } },
          methods: {
            create: [
              ...(s.sameDay ? [{ type: "SAME_DAY" as const, name: "Same-day rider", priceCents: 30000, minDays: 0, maxDays: 0, cutoffHour: 14 }] : [{ type: "NEXT_DAY" as const, name: "Next-day delivery", priceCents: 25000, minDays: 1, maxDays: 1 }]),
              { type: "PICKUP" as const, name: "Collect from the studio", priceCents: 0, minDays: 0, maxDays: 1, pickupAddress: s.pickup },
            ],
          },
        },
      });
      await db.deliveryZone.create({
        data: {
          sellerId: seller.id,
          name: "Countrywide",
          counties: { create: allCountyIds.filter((c) => c !== countyId).map((c) => ({ countyId: c })) },
          methods: { create: [{ type: "COURIER" as const, name: "Courier (G4S / Fargo)", priceCents: 45000, freeOverCents: 1_500_000, minDays: 2, maxDays: 4 }] },
        },
      });
    }
  }
  // Verified ID on file for each approved seller (a placeholder PDF in private storage), so
  // finance can pay out in development. Real documents are uploaded through /sell/status.
  const storageDir = path.resolve(process.env.STORAGE_LOCAL_DIR ?? "./storage");
  await mkdir(path.join(storageDir, "private/documents/seed"), { recursive: true });
  const pdf = Buffer.from("%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj 2 0 obj<</Type/Pages/Count 0/Kids[]>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n");
  for (const [key, id] of ids) {
    if (key === "house-seller" || (await db.sellerDocument.count({ where: { sellerId: id } }))) continue;
    const fileKey = `private/documents/seed/${key}-national-id.pdf`;
    await writeFile(path.join(storageDir, fileKey), pdf);
    await db.sellerDocument.create({ data: { sellerId: id, type: "NATIONAL_ID", fileKey, fileName: "national-id.pdf", contentType: "application/pdf", size: pdf.byteLength, status: "ACCEPTED", reviewedAt: new Date() } });
  }
  // House store delivers countrywide too.
  if (!(await db.deliveryZone.count({ where: { sellerId: "house-seller" } }))) {
    await db.deliveryZone.create({
      data: {
        sellerId: "house-seller",
        name: "Kenya",
        counties: { create: allCountyIds.map((c) => ({ countyId: c })) },
        methods: { create: [{ type: "STANDARD" as const, name: "Standard delivery", priceCents: 35000, freeOverCents: 1_000_000, minDays: 1, maxDays: 3 }, { type: "PICKUP" as const, name: "Pickup — 3Dapp hub, CBD", priceCents: 0, minDays: 0, maxDays: 1, pickupAddress: "Kimathi Street, Nairobi CBD" }] },
      },
    });
  }
  console.log(`✓ ${SELLERS.length + 1} sellers with delivery zones`);
  return ids;
}

async function seedCatalogue(sellerIds: Map<string, string>) {
  if ((await db.product.count({ where: { sellerId: { in: [...sellerIds.values()].filter((id) => id !== "house-seller") } } })) > 0) {
    console.log("• marketplace catalogue already present — skipping");
    return;
  }
  const cats = new Map<string, string>();
  for (const [i, c] of CATEGORIES.entries()) {
    const cat = await db.category.upsert({ where: { slug: c.slug }, update: { name: c.name, description: c.description, commissionRateBps: c.commissionRateBps ?? null, sortOrder: i }, create: { ...c, sortOrder: i } });
    cats.set(c.slug, cat.id);
  }
  const brandFor = async (sellerKey: string) => {
    if (sellerKey === "house-seller") return (await db.brand.upsert({ where: { slug: "3dapp-select" }, update: {}, create: { name: "3Dapp Select", slug: "3dapp-select", sellerId: "house-seller" } })).id;
    return (await db.brand.findUniqueOrThrow({ where: { slug: `${sellerKey}-label` } })).id;
  };

  const storageDir = path.resolve(process.env.STORAGE_LOCAL_DIR ?? "./storage");
  const now = Date.now();
  const created = new Map<string, string>();

  for (const [i, p] of PRODUCTS.entries()) {
    const slug = p.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
    const product = await db.product.create({
      data: {
        name: p.name,
        slug,
        description: p.description,
        brandId: await brandFor(p.seller),
        categoryId: cats.get(p.category)!,
        sellerId: sellerIds.get(p.seller)!,
        status: "PUBLISHED",
        approvalStatus: "APPROVED",
        reviewedAt: new Date(),
        isFeatured: !!p.featured,
        garmentKind: p.kind,
        priceCents: p.price * 100,
        salePriceCents: p.sale ? p.sale * 100 : null,
        material: p.material,
        fabricComposition: p.composition,
        careInstructions: /leather|sisal/i.test(p.composition) ? "Wipe clean with a damp cloth. Condition leather every few months; keep out of direct sun." : "Hand wash cold or machine wash on a gentle cycle. Dry in the shade to protect the print. Warm iron inside out.",
        measurements: p.sizes.every((s) => MEASURE[s]) ? Object.fromEntries(p.sizes.map((s) => [s, MEASURE[s]!])) : undefined,
        specifications: [
          { label: "Fit", value: pick(["Relaxed", "True to size", "Tailored", "Loose"]) },
          { label: "Made in", value: SELLERS.find((s) => s.key === p.seller)?.town ? `${SELLERS.find((s) => s.key === p.seller)!.town}, Kenya` : "Kenya" },
        ],
        tags: p.tags,
        seoTitle: `${p.name} | 3Dapp`,
        seoDescription: p.description.slice(0, 155),
        publishedAt: new Date(now - i * 2.1 * 86400_000),
      },
    });
    created.set(slug, product.id);
    for (const color of p.colors) {
      for (const size of p.sizes) {
        const sku = `${slug.split("-").map((w) => w[0]).join("").toUpperCase()}-${i}-${color.slice(0, 3).toUpperCase()}-${size.replace(/[^A-Z0-9]/gi, "")}`;
        const qty = Math.floor(rand() * 14) + (rand() < 0.1 ? 0 : 2);
        const variant = await db.productVariant.create({ data: { productId: product.id, sku, size, color, colorHex: COLORS[color] } });
        const inv = await db.inventory.create({ data: { variantId: variant.id, quantity: qty, lowStockThreshold: 2 } });
        if (qty) await db.inventoryMovement.create({ data: { inventoryId: inv.id, type: "RESTOCK", quantity: qty, balance: qty, reason: "Initial stock" } });
      }
    }
    if (p.model) {
      // Procedural silhouettes are honest placeholders: shape + main colour, NOT the real print.
      const glb = await buildGarmentGlb(p.kind, COLORS[p.colors[0]!]);
      const key = `models/seed/${slug}.glb`;
      await mkdir(path.join(storageDir, "models/seed"), { recursive: true });
      await writeFile(path.join(storageDir, key), glb);
      const report = inspectGltf(glb);
      await db.productModel3D.create({
        data: {
          productId: product.id,
          name: `${p.name} (illustrative silhouette)`,
          fileKey: key,
          url: `/media/${key}`,
          format: "glb",
          fileSize: glb.byteLength,
          representation: "ILLUSTRATIVE",
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
  console.log(`✓ ${PRODUCTS.length} products (KES) with variants, stock and ${PRODUCTS.filter((p) => p.model).length} illustrative GLB models`);

  for (const [i, c] of COLLECTIONS.entries()) {
    const col = await db.collection.upsert({ where: { slug: c.slug }, update: {}, create: { ...c, isFeatured: i < 4, isCampaign: true, sortOrder: i } });
    const members = PRODUCTS.filter((p) => p.collections.includes(c.slug));
    await db.collectionProduct.createMany({
      data: members.map((m, j) => ({ collectionId: col.id, productId: created.get(m.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, ""))!, sortOrder: j })),
      skipDuplicates: true,
    });
  }
  // Retire the pre-marketplace demo catalogue/collections if this database had one.
  await db.product.updateMany({ where: { sellerId: "house-seller", id: { notIn: [...created.values()] } }, data: { status: "ARCHIVED" } });
  await db.collection.updateMany({ where: { slug: { notIn: COLLECTIONS.map((c) => c.slug) } }, data: { isActive: false } });
  await db.category.updateMany({ where: { slug: { notIn: CATEGORIES.map((c) => c.slug) } }, data: { isActive: false } });
  console.log("✓ campaign collections");
}

async function seedContent() {
  if (await db.contentBlock.findFirst({ where: { placement: "home.hero", title: { contains: "Kenyan" } } })) return;
  await db.contentBlock.deleteMany({ where: { placement: { startsWith: "home." } } });
  await db.contentBlock.createMany({
    data: [
      { type: "HERO", placement: "home.hero", title: "Kenyan fashion, on the rail.", subtitle: "Made in Kenya", body: "Discover designers and boutiques from Nairobi to Mombasa. Slide along the rail, lift a piece off, turn it in your hands — then pay with M-Pesa.", ctaLabel: "Enter the 3D showroom", ctaHref: "/showroom", sortOrder: 0 },
      { type: "PROMOTION", placement: "home.promo", title: "Karibu! 10% off your first order", subtitle: "Use code KARIBU10 at checkout", ctaLabel: "Shop new arrivals", ctaHref: "/new-arrivals", sortOrder: 0 },
      { type: "BANNER", placement: "home.banner", title: "Pay with M-Pesa · Delivery to all 47 counties", subtitle: "Same-day in Nairobi & Mombasa from selected designers", sortOrder: 0 },
      { type: "EDITORIAL", placement: "home.editorial", title: "Every piece has a maker", subtitle: "Why 3Dapp", body: "3Dapp is a marketplace for independent Kenyan designers, tailors and boutiques. You see who made each piece and where, message them directly, and your M-Pesa payment is held safely until your order is on its way.", ctaLabel: "Meet the designers", ctaHref: "/designers", sortOrder: 0 },
      { type: "TESTIMONIAL", placement: "home.testimonials", title: "Wanjiru M.", body: "I found a Kisumu designer I'd never have discovered otherwise. Paid with M-Pesa, delivered to Nyeri in three days.", data: { location: "Nyeri" }, sortOrder: 0 },
      { type: "TESTIMONIAL", placement: "home.testimonials", title: "Hassan A.", body: "Same-day delivery in Nyali and the linen is beautiful. The seller answered my sizing question within the hour.", data: { location: "Mombasa" }, sortOrder: 1 },
      { type: "TESTIMONIAL", placement: "home.testimonials", title: "Achieng O.", body: "Lite mode is a lifesaver on my bundles — the shop still works perfectly on my phone.", data: { location: "Kisumu" }, sortOrder: 2 },
    ],
  });
  await db.navigationLink.deleteMany({ where: { location: "FOOTER" } });
  await db.navigationLink.createMany({
    data: [
      { label: "Delivery & returns", href: "/about#shipping", location: "FOOTER", group: "Help", sortOrder: 0 },
      { label: "Size guide", href: "/about#sizing", location: "FOOTER", group: "Help", sortOrder: 1 },
      { label: "Contact", href: "/about#contact", location: "FOOTER", group: "Help", sortOrder: 2 },
      { label: "About 3Dapp", href: "/about", location: "FOOTER", group: "3Dapp", sortOrder: 0 },
      { label: "3D Showroom", href: "/showroom", location: "FOOTER", group: "3Dapp", sortOrder: 1 },
    ],
  });
  await db.coupon.createMany({
    data: [
      { code: "KARIBU10", description: "10% off your first order", type: "PERCENTAGE", value: 10, perUserLimit: 1 },
      { code: "FREESHIP", description: "Free delivery from every designer", type: "FREE_SHIPPING", value: 0, minSubtotalCents: 500_000 },
      { code: "SAVE500", description: "KSh 500 off orders over KSh 5,000", type: "FIXED", value: 50_000, minSubtotalCents: 500_000 },
    ],
    skipDuplicates: true,
  });
  console.log("✓ content, navigation, coupons");
}

async function seedPromotions(sellerIds: Map<string, string>) {
  if (await db.promotion.count()) return;
  const ankara = await db.category.findUnique({ where: { slug: "ankara" } });
  await db.promotion.createMany({
    data: [
      { name: "Contemporary Ankara Week", slug: "ankara-week", description: "10% off Ankara & kitenge pieces — funded by 3Dapp.", type: "PERCENTAGE", value: 10, categoryIds: ankara ? [ankara.id] : [], sellerIds: [], endsAt: new Date(Date.now() + 10 * 86400_000) },
      { name: "Pwani Threads coastal sale", slug: "pwani-coastal-sale", description: "15% off at Pwani Threads.", type: "PERCENTAGE", value: 15, sellerIds: [sellerIds.get("pwani-threads")!], categoryIds: [], endsAt: new Date(Date.now() + 14 * 86400_000) },
    ],
  });
  console.log("✓ campaigns (one platform-funded, one seller-funded)");
}

// ─── History (orders settled through the real ledger) ─────────────────────────

const TOWNS: [string, string, string][] = [
  ["Nairobi", "Kilimani", "Argwings Kodhek Rd"], ["Nairobi", "South B", "Mchumbi Rd"], ["Mombasa", "Nyali", "Links Rd"], ["Kisumu", "Milimani", "Aga Khan Rd"],
  ["Nakuru", "Milimani", "Kenyatta Ave"], ["Uasin Gishu", "Elgon View", "Elgon Rd"], ["Kiambu", "Ruiru", "Kamakis"], ["Machakos", "Machakos Town", "Ngei Rd"], ["Nyeri", "Nyeri Town", "Kimathi Way"], ["Kilifi", "Malindi", "Lamu Rd"],
];

async function seedHistory(adminId: string) {
  if ((await db.sellerOrder.count({ where: { sellerId: { not: "house-seller" } } })) > 0) return;
  const counties = new Map((await db.county.findMany()).map((c) => [c.name, c]));
  const firstNames = ["Wanjiru", "Otieno", "Achieng", "Kamau", "Njeri", "Mwangi", "Amina", "Kiprop", "Wairimu", "Hassan", "Chebet", "Mutua"];
  const customers: { id: string; name: string; email: string; phone: string }[] = [];
  for (let i = 0; i < 24; i++) {
    const name = `${firstNames[i % firstNames.length]} ${String.fromCharCode(65 + (i % 26))}.`;
    const phone = `+2547${String(10000000 + i * 7919).slice(0, 8)}`;
    const u = await db.user.upsert({
      where: { email: `mteja${i + 1}@example.co.ke` },
      update: {},
      create: { email: `mteja${i + 1}@example.co.ke`, name, emailVerifiedAt: new Date(), createdAt: new Date(Date.now() - Math.floor(rand() * 60) * 86400_000), profile: { create: { phone } }, wishlist: { create: {} }, roles: { create: { role: { connect: { key: "CUSTOMER" } } } } },
    });
    customers.push({ id: u.id, name, email: u.email, phone });
  }
  // Follows
  const sellers = await db.seller.findMany({ where: { status: "APPROVED", id: { not: "house-seller" } } });
  for (const c of customers) {
    for (const s of sellers) if (rand() < 0.35) await db.sellerFollow.create({ data: { userId: c.id, sellerId: s.id } });
  }
  for (const s of sellers) await db.seller.update({ where: { id: s.id }, data: { followerCount: await db.sellerFollow.count({ where: { sellerId: s.id } }) } });

  const variants = await db.productVariant.findMany({ where: { product: { status: "PUBLISHED", approvalStatus: "APPROVED" }, inventory: { quantity: { gt: 2 } } }, include: { product: { include: { category: true } } } });
  const methods = await db.shippingMethod.findMany({ where: { type: { in: ["COURIER", "SAME_DAY", "NEXT_DAY", "STANDARD"] } }, include: { zone: true } });
  const e = { commission: Number(process.env.DEFAULT_COMMISSION_BPS ?? 1200) };
  const sellerRate = new Map(sellers.map((s) => [s.id, s.commissionRateBps]));
  let orders = 0;
  for (let day = 59; day >= 0; day--) {
    const date = new Date(Date.now() - day * 86400_000);
    const visitors = 25 + Math.floor(rand() * 45);
    await db.analyticsEvent.createMany({ data: Array.from({ length: visitors }, (_, i) => ({ type: "SESSION_START" as const, visitorId: `v-${day}-${i}`, createdAt: date })) });
    await db.analyticsEvent.createMany({ data: Array.from({ length: visitors * 2 }, (_, i) => ({ type: "PRODUCT_VIEW" as const, visitorId: `v-${day}-${i % visitors}`, productId: pick(variants).productId, createdAt: date })) });
    const count = Math.floor(rand() * 3) + (day % 7 === 5 ? 2 : 0);
    for (let n = 0; n < count; n++) {
      const customer = pick(customers);
      const [countyName, town, street] = pick(TOWNS);
      const county = counties.get(countyName)!;
      const lines = [...new Map(Array.from({ length: 1 + Math.floor(rand() * 3) }, () => pick(variants)).map((v) => [v.id, v])).values()];
      const bySeller = new Map<string, typeof lines>();
      for (const v of lines) bySeller.set(v.product.sellerId, [...(bySeller.get(v.product.sellerId) ?? []), v]);
      const unit = (v: (typeof lines)[number]) => v.product.salePriceCents ?? v.product.priceCents;
      const subtotal = lines.reduce((s, v) => s + unit(v), 0);
      const groups = [...bySeller.entries()].map(([sellerId, vs]) => {
        const method = methods.find((m) => m.zone.sellerId === sellerId) ?? null;
        const merch = vs.reduce((s, v) => s + unit(v), 0);
        let commission = 0;
        for (const v of vs) commission += Math.round((unit(v) * (sellerRate.get(sellerId) ?? v.product.category.commissionRateBps ?? e.commission)) / 10_000);
        const shipping = method ? (method.freeOverCents != null && merch >= method.freeOverCents ? 0 : method.priceCents) : 0;
        return { sellerId, vs, method, merch, commission, shipping };
      });
      const shipping = groups.reduce((s, g) => s + g.shipping, 0);
      const total = subtotal + shipping;
      const tax = Math.round(subtotal - subtotal / 1.16);
      const status = day > 10 ? "DELIVERED" : day > 4 ? "SHIPPED" : day > 1 ? "PROCESSING" : "PAID";
      const provider = rand() < 0.75 ? "MPESA" : "CARD";
      const address = { fullName: customer.name, phone: customer.phone, countyId: county.id, county: county.name, town, estate: town, line1: street, building: `House ${1 + Math.floor(rand() * 40)}`, country: "KE" };
      const order = await db.order.create({
        data: {
          number: generateOrderNumber(date, rand),
          userId: customer.id,
          email: customer.email,
          customerName: customer.name,
          phone: customer.phone,
          status: "PENDING_PAYMENT",
          paymentStatus: "PAID",
          currency: "KES",
          subtotalCents: subtotal,
          shippingCents: shipping,
          taxCents: tax,
          totalCents: total,
          shippingMethod: groups.length === 1 ? (groups[0]!.method?.name ?? "Pickup") : `${groups.length} deliveries`,
          shippingAddress: address,
          countyId: county.id,
          idempotencyKey: `seed-${day}-${n}-${token()}`,
          placedAt: date,
          paidAt: date,
          payments: {
            create: { provider, status: "SUCCEEDED", amountCents: total, currency: "KES", idempotencyKey: `seed-pay-${token()}`, providerReference: provider === "MPESA" ? `ws_CO_${token()}` : `ch_${token()}`, succeededAt: date, metadata: provider === "MPESA" ? { receipt: `S${token().slice(0, 9).toUpperCase()}` } : undefined },
          },
        },
      });
      for (const g of groups) {
        await db.sellerOrder.create({
          data: {
            orderId: order.id,
            sellerId: g.sellerId,
            subtotalCents: g.merch,
            shippingCents: g.shipping,
            totalCents: g.merch + g.shipping,
            commissionCents: g.commission,
            sellerNetCents: g.merch - g.commission + g.shipping,
            shippingMethodId: g.method?.id ?? null,
            shippingMethodName: g.method?.name ?? "Pickup",
            deliveryType: g.method?.type ?? "PICKUP",
            etaMinDays: g.method?.minDays ?? 0,
            etaMaxDays: g.method?.maxDays ?? 1,
            createdAt: date,
            items: {
              create: g.vs.map((v) => ({ orderId: order.id, sellerId: g.sellerId, productId: v.productId, variantId: v.id, productName: v.product.name, variantLabel: `${v.color} / ${v.size}`, sku: v.sku, unitPriceCents: unit(v), quantity: 1, totalCents: unit(v) })),
            },
          },
        });
      }
      // Settle with the real ledger logic (commission, seller pending earnings, platform cash).
      await db.$transaction((tx) => settlePaidOrder(tx as never, order.id));
      const path = ["PENDING_PAYMENT", "PAID", "PROCESSING", "SHIPPED", "DELIVERED"] as const;
      const until = path.indexOf(status);
      for (let s = 0; s <= until; s++) {
        await db.orderStatusHistory.create({ data: { orderId: order.id, fromStatus: s ? path[s - 1] : null, toStatus: path[s]!, createdAt: new Date(date.getTime() + s * 3600_000) } });
      }
      await db.order.update({ where: { id: order.id }, data: { status } });
      const sos = await db.sellerOrder.findMany({ where: { orderId: order.id } });
      for (const so of sos) {
        await db.sellerOrder.update({
          where: { id: so.id },
          data: { status, shippedAt: until >= 3 ? new Date(date.getTime() + 20 * 3600_000) : null, deliveredAt: until === 4 ? new Date(date.getTime() + 3 * 86400_000) : null },
        });
        if (until >= 3) {
          await db.shipment.create({
            data: {
              orderId: order.id,
              sellerOrderId: so.id,
              carrier: pick(["G4S", "Fargo Courier", "Sendy", "Own rider"]),
              trackingNumber: `KE${Math.floor(rand() * 1e8)}`,
              status: until === 4 ? "DELIVERED" : "IN_TRANSIT",
              shippedAt: date,
              deliveredAt: until === 4 ? new Date(date.getTime() + 3 * 86400_000) : null,
              tracking: { create: [{ status: "IN_TRANSIT", description: "Dispatched", occurredAt: new Date(date.getTime() + 20 * 3600_000) }, ...(until === 4 ? [{ status: "DELIVERED" as const, description: "Delivered", occurredAt: new Date(date.getTime() + 3 * 86400_000) }] : [])] },
            },
          });
        }
      }
      for (const v of lines) {
        const inv = await db.inventory.update({ where: { variantId: v.id }, data: { quantity: { decrement: 1 } } });
        await db.inventoryMovement.create({ data: { inventoryId: inv.id, type: "SALE", quantity: -1, balance: inv.quantity, referenceId: order.id, createdAt: date } });
        await db.product.update({ where: { id: v.productId }, data: { salesCount: { increment: 1 } } });
      }
      await db.analyticsEvent.create({ data: { type: "ORDER_PLACED", visitorId: `v-${day}-${n}`, userId: customer.id, createdAt: date } });
      orders++;
    }
  }
  const released = await releaseDueEarnings();
  // One payout already paid and one awaiting finance, so the payouts screens have data.
  const richest = await db.sellerWallet.findFirst({ where: { availableCents: { gt: 300_000 } }, orderBy: { availableCents: "desc" } });
  if (richest) {
    const amount = Math.floor(Number(richest.availableCents) / 200) * 100;
    await db.sellerWallet.update({ where: { id: richest.id }, data: { availableCents: { decrement: amount }, reservedCents: { increment: amount } } });
    await db.sellerPayout.create({ data: { sellerId: richest.sellerId, amountCents: amount, method: "MPESA", destination: "2547•••••000" } });
  }
  // Reviews
  const products = await db.product.findMany({ where: { status: "PUBLISHED" }, take: 12, orderBy: { salesCount: "desc" } });
  const bodies = ["The print is even more beautiful in person and the fit is spot on.", "Arrived in two days to Nakuru, well packaged.", "Runs slightly small — size up if you're between sizes.", "Excellent tailoring for the price. Will order again."];
  for (const p of products) {
    for (const r of customers.slice(0, 2 + Math.floor(rand() * 3))) {
      await db.review.create({ data: { productId: p.id, userId: r.id, rating: 4 + Math.round(rand()), title: pick(["Napenda sana", "Beautiful", "Great quality", "Perfect fit"]), body: pick(bodies), status: "APPROVED", verifiedPurchase: true } });
    }
    const agg = await db.review.aggregate({ where: { productId: p.id }, _avg: { rating: true }, _count: { _all: true } });
    await db.product.update({ where: { id: p.id }, data: { ratingAvg: agg._avg.rating ?? 0, ratingCount: agg._count._all } });
  }
  // A pending application so the approvals queue is never empty in development.
  const applicant = await upsertUser("applicant@sellers.3dapp.test", "Nyokabi W.", "Seller-Demo-2026", ["CUSTOMER"], false);
  if (!(await db.seller.findUnique({ where: { ownerId: applicant.id } }))) {
    await db.seller.create({
      data: {
        ownerId: applicant.id,
        slug: "nyokabi-designs",
        businessName: "Nyokabi Designs",
        countyId: counties.get("Nyeri")!.id,
        town: "Nyeri",
        profile: { create: { contactName: "Nyokabi W.", email: applicant.email, phone: "+254712999000", description: "Hand-knitted wool cardigans and ponchos from Nyeri, using wool from local smallholder farms.", categories: ["women", "accessories"] } },
        wallet: { create: {} },
        verifications: { create: { decision: "SUBMITTED" } },
      },
    });
  }
  void adminId;
  console.log(`✓ ${customers.length} customers, ${orders} multi-seller orders settled to the ledger (${released} seller orders released), follows, reviews, a pending application`);
}

async function main() {
  await seedAccess();
  await seedCounties();
  const adminEmail = process.env.SEED_ADMIN_EMAIL ?? "admin@3dapp.test";
  const adminPassword = process.env.SEED_ADMIN_PASSWORD ?? "3Dapp-Admin-2026";
  const admin = await upsertUser(adminEmail, "Platform Admin", adminPassword, ["SUPER_ADMIN"], true);
  await upsertUser("finance@3dapp.test", "Finance Manager", adminPassword, ["FINANCE_MANAGER"], true);
  await upsertUser("content@3dapp.test", "Content Manager", adminPassword, ["CONTENT_MANAGER"], true);
  await upsertUser("inventory@3dapp.test", "Inventory Lead", adminPassword, ["INVENTORY_MANAGER"], true);
  await upsertUser("support@3dapp.test", "Support Agent", adminPassword, ["CUSTOMER_SUPPORT"], true);
  await upsertUser("customer@3dapp.test", "Demo Customer", "Customer-Demo-2026", ["CUSTOMER"], false);
  console.log(`✓ staff (${adminEmail}), finance/content/inventory/support, demo customer (customer@3dapp.test)`);
  const sellerIds = await seedSellers(admin.id, "Seller-Demo-2026");
  console.log("  sellers sign in as e.g. kitenge-house@sellers.3dapp.test / Seller-Demo-2026");
  await seedCatalogue(sellerIds);
  await seedPromotions(sellerIds);
  await seedContent();
  await seedHistory(admin.id);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
