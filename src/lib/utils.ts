import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import { CURRENCIES, DEFAULT_TIMEZONE } from "@/config/locale";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Formats integer minor units. Kenyan shillings render as "KSh 1,500" / "KSh 3,999.50"
 * (whole amounts drop the decimals); other currencies use their registered symbol.
 */
export function formatMoney(cents: number, currency = "KES", locale = "en-KE") {
  const cfg = CURRENCIES[currency];
  const whole = cents % 100 === 0;
  const negative = cents < 0;
  const value = Math.abs(cents) / 100;
  if (!cfg) {
    return new Intl.NumberFormat(locale, { style: "currency", currency, minimumFractionDigits: whole ? 0 : 2, maximumFractionDigits: 2 }).format(cents / 100);
  }
  const digits = cfg.decimals === 0 || whole ? 0 : cfg.decimals;
  const number = new Intl.NumberFormat("en-KE", { minimumFractionDigits: digits, maximumFractionDigits: digits }).format(value);
  const sep = cfg.symbol.length > 1 ? " " : "";
  return `${negative ? "−" : ""}${cfg.symbol}${sep}${number}`;
}

/** Dates are always shown in East Africa Time unless a timezone is passed. */
export function formatDate(date: Date | string, opts: Intl.DateTimeFormatOptions = { dateStyle: "medium" }, locale = "en-KE") {
  return new Intl.DateTimeFormat(locale, { timeZone: DEFAULT_TIMEZONE, ...opts }).format(typeof date === "string" ? new Date(date) : date);
}

/** Normalises Kenyan phone numbers to E.164 (+2547XXXXXXXX / +2541XXXXXXXX). Returns null if invalid. */
export function normaliseKenyanPhone(input: string): string | null {
  const digits = input.replace(/[^\d+]/g, "").replace(/^\+/, "");
  let local: string;
  if (/^254[17]\d{8}$/.test(digits)) local = digits.slice(3);
  else if (/^0[17]\d{8}$/.test(digits)) local = digits.slice(1);
  else if (/^[17]\d{8}$/.test(digits)) local = digits;
  else return null;
  return `+254${local}`;
}

export function maskPhone(phone: string) {
  return phone.length > 7 ? `${phone.slice(0, 6)}•••${phone.slice(-3)}` : "•••";
}

export function slugify(input: string) {
  return input
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

export function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 ** 2).toFixed(2)} MB`;
}

export function initials(name?: string | null, email?: string) {
  const src = name?.trim() || email || "?";
  return src
    .split(/[\s@.]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join("");
}

/** Only allow relative, same-site redirect targets (prevents open redirects). */
export function safeRedirect(target: string | null | undefined, fallback = "/") {
  if (!target || !target.startsWith("/") || target.startsWith("//") || target.startsWith("/\\")) return fallback;
  return target;
}
