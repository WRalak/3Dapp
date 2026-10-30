"use client";

import { useState, useSyncExternalStore, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Feather, X } from "lucide-react";
import { LOCALES, LOCALE_LABELS, type Locale } from "@/config/locale";
import { setLiteModeAction, setLocaleAction } from "@/features/preferences/actions";
import { useLite, useLocale, useT } from "@/i18n/client";

export function LanguageSwitcher({ className }: { className?: string }) {
  const locale = useLocale();
  const t = useT();
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <label className={className}>
      <span className="sr-only">{t("common.language")}</span>
      <select
        value={locale}
        disabled={pending}
        onChange={(e) => start(async () => (await setLocaleAction({ locale: e.target.value as Locale }), router.refresh()))}
        className="h-8 border border-current/20 bg-transparent px-2 text-xs"
      >
        {LOCALES.map((l) => (
          <option key={l} value={l} className="text-ink">
            {LOCALE_LABELS[l]}
          </option>
        ))}
      </select>
    </label>
  );
}

export function LiteToggle({ className }: { className?: string }) {
  const lite = useLite();
  const t = useT();
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      disabled={pending}
      aria-pressed={lite}
      onClick={() => start(async () => (await setLiteModeAction({ enabled: !lite }), router.refresh()))}
      className={className ?? "inline-flex items-center gap-1.5 text-xs underline-offset-4 hover:underline"}
    >
      <Feather className="size-3.5" aria-hidden /> {lite ? t("common.liteDisable") : t("common.liteEnable")}
    </button>
  );
}

type NetInfo = { saveData?: boolean; effectiveType?: string };

const noopSubscribe = () => () => undefined;
function slowConnection() {
  try {
    if (sessionStorage.getItem("mtindo_lite_dismissed") === "1") return false;
  } catch {
    /* storage unavailable */
  }
  const c = (navigator as Navigator & { connection?: NetInfo }).connection;
  return !!c && (!!c.saveData || c.effectiveType === "2g" || c.effectiveType === "slow-2g" || c.effectiveType === "3g");
}

/**
 * Suggests Lite mode on slow or data-saver connections (common on prepaid mobile data) and
 * confirms when it's on. Dismissal is remembered for the session only.
 */
export function LiteBanner() {
  const lite = useLite();
  const t = useT();
  const slow = useSyncExternalStore(noopSubscribe, slowConnection, () => false);
  const [dismissed, setDismissed] = useState(false);
  const suggest = !lite && slow && !dismissed;
  if (!lite && !suggest) return null;
  const dismiss = () => {
    setDismissed(true);
    try {
      sessionStorage.setItem("mtindo_lite_dismissed", "1");
    } catch {
      /* ignore */
    }
  };
  return (
    <div role="status" className="bg-bone text-xs text-graphite">
      <div className="container-luxe flex items-center justify-between gap-3 py-2">
        <span>{lite ? t("common.liteOn") : t("common.liteSuggest")}</span>
        <span className="flex shrink-0 items-center gap-3">
          <LiteToggle />
          {!lite && (
            <button type="button" onClick={dismiss} aria-label={t("common.dismiss")}>
              <X className="size-3.5" />
            </button>
          )}
        </span>
      </div>
    </div>
  );
}
