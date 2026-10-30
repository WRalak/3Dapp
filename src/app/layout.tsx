import type { Metadata, Viewport } from "next";
import { Providers } from "@/components/providers";
import { site } from "@/config/site";
import { getLocale, isLiteMode } from "@/i18n/server";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL(process.env.APP_URL ?? "http://localhost:3000"),
  title: { default: `${site.name} — ${site.tagline}`, template: `%s | ${site.name}` },
  description: site.description,
  openGraph: { type: "website", siteName: site.name, title: site.name, description: site.description, locale: "en_KE" },
  twitter: { card: "summary_large_image" },
  robots: { index: true, follow: true },
};

export const viewport: Viewport = {
  themeColor: "#f7f5f1",
  width: "device-width",
  initialScale: 1,
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const [locale, lite] = await Promise.all([getLocale(), isLiteMode()]);
  return (
    <html lang={locale === "sw" ? "sw" : "en-KE"} data-lite={lite ? "1" : undefined}>
      <body className="min-h-dvh">
        <a href="#main" className="sr-only z-[100] bg-ink px-4 py-2 text-ivory focus:not-sr-only focus:fixed focus:left-4 focus:top-4">
          Skip to content
        </a>
        <Providers locale={locale} lite={lite}>
          {children}
        </Providers>
      </body>
    </html>
  );
}
