import type { NextConfig } from "next";

const securityHeaders = [
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(self), payment=(self), usb=()" },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  { key: "X-DNS-Prefetch-Control", value: "on" },
];

const remoteHosts = [process.env.S3_PUBLIC_URL, process.env.CDN_URL]
  .filter((u): u is string => !!u)
  .map((u) => new URL(u))
  .map((u) => ({ protocol: u.protocol.replace(":", "") as "https" | "http", hostname: u.hostname }));

const nextConfig: NextConfig = {
  output: "standalone",
  // Pin the project root: a lockfile in a parent folder (e.g. a clone nested inside another
  // checkout) must not change module resolution or file watching.
  turbopack: { root: process.cwd() },
  poweredByHeader: false,
  reactStrictMode: true,
  serverExternalPackages: ["@node-rs/argon2", "pino", "ioredis", "pg"],
  images: {
    formats: ["image/avif", "image/webp"],
    // 45 is used in Lite (low-bandwidth) mode; 75 is the default.
    qualities: [45, 75],
    deviceSizes: [390, 640, 828, 1080, 1440, 1920],
    minimumCacheTTL: 60 * 60 * 24 * 30,
    remotePatterns: [{ protocol: "https", hostname: "lh3.googleusercontent.com" }, { protocol: "https", hostname: "res.cloudinary.com" }, ...remoteHosts],
    localPatterns: [{ pathname: "/media/**" }, { pathname: "/images/**" }],
  },
  async headers() {
    return [
      { source: "/:path*", headers: securityHeaders },
      { source: "/vendor/:path*", headers: [{ key: "Cache-Control", value: "public, max-age=31536000, immutable" }] },
      { source: "/fonts/:path*", headers: [{ key: "Cache-Control", value: "public, max-age=31536000, immutable" }] },
    ];
  },
};

export default nextConfig;
