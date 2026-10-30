"use client";

import { useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MotionConfig } from "framer-motion";
import { Toaster } from "sonner";
import type { Locale } from "@/config/locale";
import { LocaleProvider } from "@/i18n/client";

export function Providers({ children, locale, lite }: { children: React.ReactNode; locale: Locale; lite: boolean }) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: { queries: { refetchOnWindowFocus: false, retry: 1 } },
      }),
  );
  return (
    <QueryClientProvider client={client}>
      <LocaleProvider locale={locale} lite={lite}>
        {/* Respect the user's OS-level reduced-motion preference for every animation. */}
        <MotionConfig reducedMotion="user">{children}</MotionConfig>
      </LocaleProvider>
      <Toaster
        position="bottom-center"
        toastOptions={{
          classNames: {
            toast: "!rounded-none !border !border-border !bg-ivory !text-ink !font-sans !shadow-lg",
            description: "!text-taupe",
          },
        }}
      />
    </QueryClientProvider>
  );
}
