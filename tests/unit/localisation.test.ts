import { describe, expect, it } from "vitest";
import { formatDate, formatMoney, maskPhone, normaliseKenyanPhone } from "@/lib/utils";
import { negotiateLocale } from "@/config/locale";
import { dictionaryFor, makeT } from "@/i18n";
import { en } from "@/i18n/en";
import { sw } from "@/i18n/sw";

describe("KES formatting", () => {
  it("formats shillings the Kenyan way", () => {
    expect(formatMoney(150_000)).toBe("KSh 1,500");
    expect(formatMoney(399_950)).toBe("KSh 3,999.50");
    expect(formatMoney(0)).toBe("KSh 0");
    expect(formatMoney(-50_000)).toBe("−KSh 500");
    expect(formatMoney(123_456_700)).toBe("KSh 1,234,567");
  });
  it("supports other regional currencies", () => {
    expect(formatMoney(500_000, "UGX")).toMatch(/^USh\s?5,000$/);
  });
});

describe("dates", () => {
  it("default to Africa/Nairobi", () => {
    // 22:30 UTC is 01:30 the next day in Nairobi.
    expect(formatDate(new Date("2026-10-30T22:30:00Z"), { dateStyle: "short" })).toMatch(/31/);
  });
});

describe("Kenyan phone numbers", () => {
  it("normalises every common way of writing a Safaricom/Airtel number", () => {
    for (const v of ["0712345678", "0712 345 678", "+254712345678", "254712345678", "712345678", "0112345678"]) expect(normaliseKenyanPhone(v)).toMatch(/^\+254[17]\d{8}$/);
    expect(normaliseKenyanPhone("0712345678")).toBe("+254712345678");
  });
  it("rejects landlines, foreign and malformed numbers", () => {
    for (const v of ["0202345678", "+255712345678", "07123", "abc", ""]) expect(normaliseKenyanPhone(v)).toBeNull();
  });
  it("masks numbers for display", () => {
    expect(maskPhone("+254712345678")).toBe("+25471•••678");
  });
});

describe("languages", () => {
  it("negotiates Kiswahili or English (Kenya) from Accept-Language", () => {
    expect(negotiateLocale("sw-KE,sw;q=0.9,en;q=0.8")).toBe("sw");
    expect(negotiateLocale("en-GB,en;q=0.9")).toBe("en-KE");
    expect(negotiateLocale("fr-FR, sw;q=0.5")).toBe("sw");
    expect(negotiateLocale(undefined)).toBe("en-KE");
  });
  it("has a Kiswahili string for every English key", () => {
    const missing = Object.keys(en).filter((k) => !(k in sw) || !(sw as Record<string, string>)[k]);
    expect(missing).toEqual([]);
  });
  it("interpolates variables", () => {
    const t = makeT(dictionaryFor("sw"));
    expect(t("designers.pieces", { count: 12 })).toBe("Mavazi 12");
    expect(makeT(dictionaryFor("en-KE"))("designers.followers", { count: 3 })).toBe("3 followers");
  });
});
