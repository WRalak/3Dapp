# Progress report

Status of each phase in the brief, with how it was verified. Everything listed as done runs against real PostgreSQL and Redis. No analytics figure or product record is hardcoded; the seed writes real rows, and every screen reads them.

## Phase summary

| Phase | Status | Notes |
|---|---|---|
| 1. Foundation | ✅ Done | Next.js 16 App Router, TS strict (+`noUncheckedIndexedAccess`), Tailwind 4 design tokens, Prisma 7 + PG adapter, modular `src/` structure |
| 2. Auth & permissions | ✅ Done | Email/password (Argon2id), Google OAuth (PKCE), email verification, password reset, DB sessions with revocation, TOTP MFA for staff, 7 roles × 25 permissions, invitations, suspension, access reset |
| 3. Storefront | ✅ Done | Editorial homepage (all requested sections, CMS-driven), shop with search/filters/sort/pagination, product pages (gallery, zoom, 3D tab, measurements, reviews, related/recommended/recently viewed), collections, new arrivals, about, wishlist, cart drawer + page |
| 4. 3D showroom | ✅ Done | Rail with swipe/drag inertia, per-garment drag and re-hang, sway, tap/click to inspect, rotate/zoom/preset views, live product panel with add-to-bag/wishlist, windowed GLB loading (Draco/KTX2/Meshopt), adaptive tiers, 2D fallback, keyboard & screen-reader support |
| 5. Administration | ✅ Done | Overview KPIs + charts, product CRUD with variants, images and models, 3D asset library with validation and preview, orders (fulfil/cancel/refund/invoice), customers (history, suspend), inventory (adjust, thresholds, movements), analytics (date range + CSV), content (banners, sections, nav, coupons, reviews), categories/brands, collections, staff, role matrix, audit log, settings |
| 6. Checkout & payments | ✅ Done | Server-priced checkout, reservations, idempotency, provider abstraction (M-Pesa, Stripe card, PayPal, sandbox), signed webhooks, reconciliation, failed-payment recovery, refunds |
| 7. Security & performance | ✅ Done | See `SECURITY.md`. Redis caching, code-split 3D, paused rendering, adaptive DPR, CDN-friendly headers |
| 8. Production readiness | ✅ Done | Tests, Dockerfile + Compose, GitHub Actions CI, migrations, deployment and backup/recovery docs, Sentry, health checks |

## Verification performed

- **Type safety and lint:** `tsc --noEmit` is clean; ESLint reports 0 errors (3 warnings: React Compiler notices about React Hook Form's `watch`).
- **Unit tests (71):** pricing/tax/coupons, the order state machine, RBAC resolution and the least-privilege role defaults, crypto (signed tokens, AES-GCM), TOTP against the RFC 6238 vectors, Argon2id, webhook signatures (tamper, replay, wrong secret), the glTF inspector (valid GLB, executables, lying headers, external URIs, unsupported extensions), upload allow-lists and magic bytes, device tiers, checkout/product/filter validation, and CSV/HTML/SVG output encoding.
- **Integration tests (44, real Postgres):**
  - registration, generic login errors, lockout, suspended accounts, suspicious-login detection;
  - hashed session tokens and revocation, single-use password reset;
  - server-side RBAC for every role, MFA enforcement, direct grants, live role edits, escalation prevention;
  - cart pricing and stock limits, coupons, guest-cart merge;
  - idempotent orders, sequential and **truly concurrent** stock races (6 parallel transactions competing for 2 units), per-customer coupon limits, foreign saved addresses rejected, reservation release on cancel and expiry;
  - webhook fulfilment, bad signatures, replay idempotency, amount mismatch, failure recovery, partial and full refunds with restock;
  - product CRUD (audit, SKU conflicts, publish-permission downgrade, soft delete);
  - inventory adjustments and DB constraints; append-only triggers.
- **End-to-end (30 Playwright runs across desktop, Pixel 7 touch, and WebGL disabled):**
  - storefront rendering, search and filters, variant selection and add-to-bag, 404s, security headers/CSP;
  - guest checkout through the sandbox gateway to a paid order, field validation, declined-payment retry;
  - registration and sign-out, weak passwords, customers blocked from the admin UI and admin APIs (403), protected-route redirects, cross-site POST rejected, generic login errors;
  - showroom rendering, drag/swipe, keyboard and touch inspection, toolbar controls, 2D fallback;
  - admin KPIs, product creation appearing in the store, inline validation, order history, CSV export.
- **Production build:** `next build` succeeds. `next start` was smoke-tested, and in a real browser the strict nonce CSP produced **zero violations** while hydration, the WebGL canvas and the Draco/WASM decoders all worked.
- **Worker:** processed queued email, notification and reservation jobs through `npm run worker`.
- **Uploads:** a real GLB uploaded through the admin UI via a signed URL was accepted and analysed; a fake `.glb` with an executable header was rejected and deleted.
- **Backups:** `backup.sh` → `restore.sh` into a fresh database, checksum verified, order counts matched.
- **DB roles:** `db-roles.sql` applied; migrations ran as the migrator role; the app role could read and write but was refused `DROP TABLE`.

## Defects found and fixed during verification

1. Optional money fields were effectively required under Zod 4 (caught by a unit test).
2. Studio-pickup checkout validated hidden, half-filled address fields, so the form silently refused to submit (caught by e2e; regression test added).
3. The discount-code `<form>` was nested inside the checkout `<form>` (hydration error).
4. GLB eviction inside Suspense cleanups mis-parented models on mobile (caught by touch e2e plus screenshots); replaced with ref-counted, deferred disposal.
5. The worker failed under the `react-server` resolution condition; it now runs with a dedicated tsconfig.
6. In production without SMTP, email bodies (containing one-time tokens) would have been logged; production now fails the job instead.
7. The DB client was created at import time, which would break `docker build` without a database; it is now lazy.

## Known limitations and follow-ups

- **Satoshi font:** the font host was unreachable from the build sandbox, so the woff2 isn't committed. Drop `Satoshi-Variable.woff2` into `public/fonts/`; until then a fallback sans-serif is used.
- **Docker:** the Dockerfile and Compose file were written and the standalone output they package was run, but no Docker daemon was available here to run `docker build`. CI includes an image build job.
- **Live payment providers** (Stripe, PayPal, Safaricom) were not called, because there were no credentials or network access. Their adapters follow the providers' documented APIs. Signature verification, idempotency, fulfilment, recovery and refunds are exercised end to end through the sandbox provider, which shares the same pipeline. Test each provider in its own sandbox before launch.
- **M-Pesa refunds** are recorded as pending and completed manually in the M-Pesa org portal (the Reversal API needs initiator credentials). Staff mark them complete in the admin.
- **Product photography:** the demo catalogue uses generated SVG artwork and procedural GLB garments. Upload real photography and production-quality models (ideally Draco- and KTX2-compressed) through the admin.
- **Server-side model optimisation:** uploads are validated and scored but not transcoded. Running `gltf-transform optimize` in the `assets.process` job is a natural next step.
- **Invoices** are print-ready HTML (Print → Save as PDF) rather than server-generated PDFs.
