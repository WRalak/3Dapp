import { NextResponse, type NextRequest } from "next/server";

/**
 * Edge proxy: per-request CSP nonce, security headers, and *optimistic* auth redirects.
 * Real authorisation always happens server-side in pages, actions and route handlers.
 */
const SESSION_COOKIES = ["__Host-atelier_session", "atelier_session"];

function assetOrigins() {
  return [process.env.CDN_URL, process.env.S3_PUBLIC_URL]
    .filter((v): v is string => !!v)
    .map((u) => {
      try {
        return new URL(u).origin;
      } catch {
        return null;
      }
    })
    .filter(Boolean)
    .join(" ");
}

export function buildCsp(nonce: string, isDev: boolean) {
  const assets = assetOrigins();
  const cloudinary = process.env.CLOUDINARY_CLOUD_NAME ? "https://res.cloudinary.com" : "";
  return [
    `default-src 'self'`,
    // strict-dynamic: only nonce'd scripts (and what they load) run. wasm-unsafe-eval for Draco/Basis decoders.
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic' 'wasm-unsafe-eval'${isDev ? " 'unsafe-eval'" : ""}`,
    `style-src 'self' 'unsafe-inline'`,
    `img-src 'self' data: blob: https://lh3.googleusercontent.com ${assets} ${cloudinary}`.trim(),
    `font-src 'self' data:`,
    `connect-src 'self' blob: data: ${assets}${isDev ? " ws:" : ""}`.trim(),
    `worker-src 'self' blob:`,
    `media-src 'self' blob:`,
    `object-src 'none'`,
    `base-uri 'self'`,
    `form-action 'self' https://checkout.stripe.com https://www.paypal.com https://www.sandbox.paypal.com`,
    `frame-ancestors 'none'`,
    `frame-src 'none'`,
    ...(isDev ? [] : ["upgrade-insecure-requests"]),
  ].join("; ");
}

export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const hasSession = SESSION_COOKIES.some((c) => request.cookies.has(c));

  if (!hasSession && (pathname.startsWith("/admin") || pathname.startsWith("/account"))) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = `?next=${encodeURIComponent(pathname + search)}`;
    return NextResponse.redirect(url);
  }

  const nonce = btoa(crypto.randomUUID());
  const csp = buildCsp(nonce, process.env.NODE_ENV !== "production");
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("content-security-policy", csp);

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set("content-security-policy", csp);
  if (pathname.startsWith("/admin") || pathname.startsWith("/account") || pathname.startsWith("/checkout")) {
    response.headers.set("cache-control", "private, no-store");
    response.headers.set("x-robots-tag", "noindex");
  }
  return response;
}

export const config = {
  matcher: [
    {
      source: "/((?!api|_next/static|_next/image|media|vendor|fonts|favicon.ico|robots.txt|sitemap.xml).*)",
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" },
      ],
    },
  ],
};
