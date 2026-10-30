import type { Locale } from "@/config/locale";
import { en, type Dictionary, type DictKey } from "./en";
import { sw } from "./sw";

export type { DictKey, Dictionary };

const DICTIONARIES: Record<Locale, Dictionary> = { "en-KE": en, sw };

export function dictionaryFor(locale: Locale): Dictionary {
  return DICTIONARIES[locale] ?? en;
}

export type Translate = (key: DictKey, vars?: Record<string, string | number>) => string;

/** Builds a translator with `{name}` interpolation; unknown keys fall back to English. */
export function makeT(dict: Dictionary): Translate {
  return (key, vars) => {
    const template = dict[key] ?? en[key] ?? key;
    return vars ? template.replace(/\{(\w+)\}/g, (_, k: string) => String(vars[k] ?? `{${k}}`)) : template;
  };
}
