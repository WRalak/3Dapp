"use client";

import { createContext, useContext, useMemo } from "react";
import type { Locale } from "@/config/locale";
import { dictionaryFor, makeT, type Translate } from "./index";

interface LocaleContextValue {
  locale: Locale;
  t: Translate;
  lite: boolean;
}

const LocaleContext = createContext<LocaleContextValue>({ locale: "en-KE", t: makeT(dictionaryFor("en-KE")), lite: false });

export function LocaleProvider({ locale, lite, children }: { locale: Locale; lite: boolean; children: React.ReactNode }) {
  const value = useMemo(() => ({ locale, lite, t: makeT(dictionaryFor(locale)) }), [locale, lite]);
  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>;
}

export const useT = () => useContext(LocaleContext).t;
export const useLocale = () => useContext(LocaleContext).locale;
export const useLite = () => useContext(LocaleContext).lite;
