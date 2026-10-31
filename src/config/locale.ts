/**
 * Regional configuration. Kenya first; the registries below are where East African and
 * international markets are added (currency, language, timezone) without code changes elsewhere.
 */
export const LOCALES = ["en-KE", "sw"] as const;
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = "en-KE";
export const LOCALE_COOKIE = "3dapp_locale";

export const LOCALE_LABELS: Record<Locale, string> = { "en-KE": "English", sw: "Kiswahili" };
/** Locale used for number/date formatting (Kiswahili formats like Kenyan English). */
export const FORMAT_LOCALE: Record<Locale, string> = { "en-KE": "en-KE", sw: "sw-KE" };

export const DEFAULT_TIMEZONE = "Africa/Nairobi";
export const DEFAULT_COUNTRY = "KE";

export interface CurrencyConfig {
  code: string;
  symbol: string;
  /** Minor units shown when the amount isn't whole (KES 2 — cents are rare but exact). */
  decimals: number;
}

export const CURRENCIES: Record<string, CurrencyConfig> = {
  KES: { code: "KES", symbol: "KSh", decimals: 2 },
  UGX: { code: "UGX", symbol: "USh", decimals: 0 },
  TZS: { code: "TZS", symbol: "TSh", decimals: 0 },
  RWF: { code: "RWF", symbol: "FRw", decimals: 0 },
  USD: { code: "USD", symbol: "$", decimals: 2 },
};

export function isLocale(v: string | undefined | null): v is Locale {
  return !!v && (LOCALES as readonly string[]).includes(v);
}

/** Picks the best supported locale from an Accept-Language header. */
export function negotiateLocale(acceptLanguage: string | null | undefined): Locale {
  if (!acceptLanguage) return DEFAULT_LOCALE;
  const prefs = acceptLanguage
    .split(",")
    .map((part) => {
      const [tag, q] = part.trim().split(";q=");
      return { tag: (tag ?? "").toLowerCase(), q: q ? Number(q) : 1 };
    })
    .sort((a, b) => b.q - a.q);
  for (const { tag } of prefs) {
    if (tag.startsWith("sw")) return "sw";
    if (tag.startsWith("en")) return "en-KE";
  }
  return DEFAULT_LOCALE;
}
