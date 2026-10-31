import "server-only";
import { cache } from "react";
import { cookies, headers } from "next/headers";
import { DEFAULT_LOCALE, isLocale, LOCALE_COOKIE, negotiateLocale, type Locale } from "@/config/locale";
import { dictionaryFor, makeT } from "./index";

export const LITE_COOKIE = "3dapp_lite";

/**
 * Locale resolution: explicit cookie (language switcher) → Accept-Language → en-KE.
 * Cookie-based rather than /sw/... sub-paths so every existing URL stays stable.
 */
export const getLocale = cache(async (): Promise<Locale> => {
  try {
    const jar = await cookies();
    const fromCookie = jar.get(LOCALE_COOKIE)?.value;
    if (isLocale(fromCookie)) return fromCookie;
    return negotiateLocale((await headers()).get("accept-language"));
  } catch {
    return DEFAULT_LOCALE;
  }
});

export async function getT() {
  return makeT(dictionaryFor(await getLocale()));
}

/** Low-bandwidth "Lite" mode — fewer/smaller images and no 3D downloads. */
export const isLiteMode = cache(async () => {
  try {
    return (await cookies()).get(LITE_COOKIE)?.value === "1";
  } catch {
    return false;
  }
});
