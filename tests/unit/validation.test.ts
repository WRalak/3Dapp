import { describe, expect, it } from "vitest";
import { checkoutSchema } from "@/lib/validation/checkout";
import { productInputSchema } from "@/lib/validation/admin";
import { productFilterSchema } from "@/lib/validation/catalog";
import { toCsv } from "@/server/services/analytics.service";
import { renderGarmentSvg } from "@/features/showroom/garment-svg";
import { renderInvoiceHtml } from "@/features/orders/invoice";

const checkout = {
  email: "a@b.co",
  customerName: "Ada",
  phone: "+254700000000",
  shippingMethod: "standard",
  paymentMethod: "CARD",
  idempotencyKey: "0123456789abcdef0123",
  address: { fullName: "Ada", phone: "+254700000000", line1: "1 Road", city: "Nairobi", country: "ke" },
} as const;

describe("checkout validation", () => {
  it("accepts a complete checkout and normalises the country", () => {
    const r = checkoutSchema.safeParse(checkout);
    expect(r.success).toBe(true);
    expect(r.data?.address?.country).toBe("KE");
  });
  it("requires an address unless collecting in store", () => {
    expect(checkoutSchema.safeParse({ ...checkout, address: undefined }).success).toBe(false);
    expect(checkoutSchema.safeParse({ ...checkout, address: undefined, shippingMethod: "pickup" }).success).toBe(true);
  });
  it("ignores half-filled hidden address fields for studio pickup (regression)", () => {
    const r = checkoutSchema.safeParse({ ...checkout, shippingMethod: "pickup", address: { fullName: "Ada", phone: "", line1: "", city: "", country: "KE" } });
    expect(r.success).toBe(true);
    expect(r.data?.address).toBeUndefined();
  });
  it("reports nested address errors when delivery needs one", () => {
    const r = checkoutSchema.safeParse({ ...checkout, address: { ...checkout.address, line1: "" } });
    expect(r.success).toBe(false);
    expect(r.error?.issues.some((i) => i.path.join(".") === "address.line1")).toBe(true);
  });
  it("requires a Safaricom number for M-Pesa", () => {
    expect(checkoutSchema.safeParse({ ...checkout, paymentMethod: "MPESA" }).success).toBe(false);
    expect(checkoutSchema.safeParse({ ...checkout, paymentMethod: "MPESA", mpesaPhone: "0712345678" }).success).toBe(true);
  });
  it("rejects client-supplied prices (unknown keys are stripped)", () => {
    const r = checkoutSchema.safeParse({ ...checkout, totalCents: 1 });
    expect(r.success && "totalCents" in r.data).toBe(false);
  });
});

describe("product validation", () => {
  const base = {
    name: "Coat",
    description: "A long enough description",
    brandId: "b",
    categoryId: "c",
    garmentKind: "COAT",
    price: 100,
    variants: [{ sku: "COAT-1", size: "M", color: "Ink", colorHex: "#111111" }],
  };
  it("accepts a minimal product", () => expect(productInputSchema.safeParse(base).success).toBe(true));
  it("rejects duplicate SKUs, sale >= price and invalid JSON", () => {
    const dupe = productInputSchema.safeParse({ ...base, variants: [base.variants[0], { ...base.variants[0], size: "L" }] });
    expect(dupe.success).toBe(false);
    expect(productInputSchema.safeParse({ ...base, salePrice: 150 }).success).toBe(false);
    expect(productInputSchema.safeParse({ ...base, measurements: "{nope" }).success).toBe(false);
  });
});

describe("catalogue filters", () => {
  it("coerces and sanitises URL params", () => {
    const f = productFilterSchema.parse({ size: "S,M", page: "-4", sort: "drop table", minPrice: "abc" });
    expect(f.size).toEqual(["S", "M"]);
    expect(f.page).toBe(1);
    expect(f.sort).toBe("featured");
    expect(f.minPrice).toBeUndefined();
  });
});

describe("output encoding", () => {
  it("neutralises CSV formula injection", () => {
    const csv = toCsv([{ name: "=HYPERLINK(\"http://evil\")", qty: -3 }]);
    expect(csv).toContain(`"'=HYPERLINK(""http://evil"")"`);
    expect(csv).toContain("-3");
  });
  it("only renders allow-listed garment artwork parameters", () => {
    const svg = renderGarmentSvg("<script>", "\"/><script>alert(1)</script>", "front");
    expect(svg).not.toContain("<script>");
    expect(svg).toContain("#2b2a28");
  });
  it("escapes customer data in invoices", () => {
    const html = renderInvoiceHtml({
      number: "AT-1",
      placedAt: new Date(),
      paidAt: null,
      customerName: "<img src=x onerror=alert(1)>",
      email: "a@b.co",
      phone: null,
      currency: "USD",
      subtotalCents: 100,
      discountCents: 0,
      shippingCents: 0,
      taxCents: 0,
      totalCents: 100,
      couponCode: null,
      shippingMethod: "standard",
      shippingAddress: { line1: "<b>1</b>" },
      items: [],
      payments: [],
    });
    expect(html).not.toContain("<img src=x");
    expect(html).toContain("&lt;img");
  });
});
