# Architecture

## Layout

```
src/
├── app/
│   ├── (store)/          customer storefront: home, shop, products, designers, collections,
│   │                     showroom, wishlist, cart, checkout, /sell onboarding, account
│   ├── seller/           seller portal (own layout; seller resolved from the session)
│   ├── (auth)/           login, register, reset, verify email, MFA, staff invitations
│   ├── admin/            administration dashboard (own layout, permission-filtered)
│   ├── api/              Route Handlers: cart, wishlist, products, uploads, webhooks,
│   │                     payment callbacks, OAuth, analytics, invoices, cron, health
│   └── media/[...key]    local storage driver file serving
├── components/           ui/ (design system), store/, products/, showroom/, admin/
├── features/             domain logic + Server Actions: auth, users, orders (pricing,
│                         promotions, state machine, invoices), payments (providers incl.
│                         M-Pesa C2B), payouts (manual, M-Pesa B2C), finance (settlement),
│                         delivery (counties, availability, address, shipping providers),
│                         marketplace actions, preferences, sms, showroom, uploads, admin
├── i18n/                 en-KE and Kiswahili dictionaries, locale + Lite-mode resolution
├── server/
│   ├── services/         use cases (auth, catalogue, cart, orders, payments, inventory,
│   │                     assets, analytics, admin, audit, notifications, email,
│   │                     seller, delivery, fulfilment, finance, community)
│   ├── repositories/     query builders shared by services
│   └── jobs/             Postgres job queue, handlers, worker, cron runner
├── lib/                  auth (sessions, guards, RBAC, OAuth), db, cache, security,
│                         storage, validation (Zod), errors, action/route wrappers
├── hooks/  stores/  types/  config/
prisma/                   schema, migrations (incl. hand-written triggers/constraints), seed
tests/                    unit/, integration/ (real Postgres), e2e/ (Playwright)
```

**Layering rule:** pages, Server Actions and Route Handlers authorise the caller, validate input with Zod, then call `server/services`. Services own transactions and business rules. Pure domain logic (pricing, state machine, glTF inspection, capability classification, signatures) has no I/O, so it is unit-tested directly.

## Data model highlights

- **Marketplace:** `Seller` (+ `SellerProfile`, `SellerDocument`, append-only `SellerVerification`), `SellerOrder` per seller per order, `Commission`, `SellerWallet`, `SellerPayout`, append-only `PlatformTransaction` ledger, `PaymentTransaction` (every provider interaction, unique M-Pesa receipts), `County`, `DeliveryZone`, `ShippingMethod`, `ShipmentTracking`, `Promotion`, `SellerFollow`, `SellerInquiry`, `ProductReport`, `PhoneVerification`. See [MARKETPLACE.md](MARKETPLACE.md).
- Migration `20261030120000_marketplace` backfilled existing products and orders to a house seller before making `Product.sellerId` required, so it upgrades a live single-vendor database without data loss.

- All money is stored as **integer minor units**. Prices, discounts, shipping and tax are always recomputed on the server from the database.
- **Inventory** keeps `quantity` (on hand) and `reserved` (held by unpaid orders). A `CHECK (reserved <= quantity AND quantity >= 0)` constraint makes overselling impossible at the database level. Every change writes an `InventoryMovement`.
- `OrderStatusHistory` and `AuditLog` are **append-only**: database triggers reject `UPDATE` and `DELETE`.
- Soft deletion applies to products, variants, addresses, users and 3D assets. Order items snapshot names, SKUs and prices, so history survives catalogue changes.
- A GIN full-text index uses an immutable `product_search_document()` function for weighted product search.

## Orders and payments

Orders are split into seller orders and settled through the ledger; see [MARKETPLACE.md](MARKETPLACE.md) for the multi-seller flow, commission, payouts and M-Pesa C2B. The pipeline below applies to the customer payment.

1. **Checkout** (`placeOrder`) runs in one transaction. It recomputes totals, validates the coupon (atomic redemption cap), creates the order and items, **reserves stock** with conditional `UPDATE … WHERE quantity - reserved >= n`, writes status history and clears the cart. An idempotency key makes double-submits return the same order. Stock is held for 30 minutes.
2. **Payment start** creates a `Payment` row (with its own idempotency key), then calls the provider adapter. Adapters implement `initiate`, `verifyWebhook`, `fetchStatus` and `refund` (`src/features/payments`), so checkout never knows provider details.
3. **Fulfilment** happens only from verified server-side signals:
   - Card (Stripe) and sandbox: HMAC-signed webhooks.
   - PayPal: verify-webhook-signature API, or a server-to-server capture on return.
   - M-Pesa: an HMAC-signed callback URL, a matching CheckoutRequestID, then an STK Push Query confirmation.

   Each event is stored in `PaymentEvent`, unique on `(provider, eventId)`, which de-duplicates webhooks. Fulfilment locks the payment row, checks amount and currency, converts reservations into sales and enqueues the confirmation email.
4. **Recovery and reconciliation:** failed payments leave the order payable, and customers retry from the confirmation page. The expiry job reconciles pending payments with the provider before cancelling and releasing stock. A payment that arrives after cancellation is recorded and flagged in the audit log.
5. **Refunds** go through the provider. Partial and full refunds are tracked, and full refunds before shipping can restock. M-Pesa reversals are recorded as pending, because they are completed in the M-Pesa org portal.

## 3D showroom

- **Rail scene** (`components/showroom/rail-scene.tsx`): garments are positioned in world space by `useFrame`. Interaction state lives in a Zustand store and is read with `getState()`, so dragging never triggers React re-renders.
  - Inertial scrolling, elastic edges and snap-to-garment.
  - Damped-pendulum sway driven by rail acceleration and hover.
  - Per-garment drag to re-hang a piece in a new slot.
  - Lift-to-inspect with 360° yaw, limited pitch, zoom and front/side/back presets.
  - Hangers are two instanced meshes, so they cost two draw calls regardless of rail length.
- **Windowed loading:** only garments within `loadRadius` of the focus (1–3 depending on device tier), plus the selected one, fetch their GLB. The next model is preloaded, and the rest render a shared procedural lathe garment with a fabric sheen and a woven normal map. Models are reference-counted and their GPU resources are disposed 20 seconds after their last use.
- **Loaders:** Draco (decoded in Web Workers), KTX2/Basis and Meshopt. Decoders are self-hosted under `/public/vendor`, so they comply with the CSP and need no third-party CDN.
- **Adaptivity:**
  - Device probe → tier (`features/showroom/capabilities.ts`): DPR cap, load radius, geometry segments, shadows, antialiasing.
  - `PerformanceMonitor` adjusts DPR at runtime.
  - Rendering pauses when the canvas is off-screen or the tab is hidden.
  - Reduced motion disables sway and easing.
  - Without WebGL, or if the canvas crashes, an error boundary swaps in a 2D gallery with the same purchase panel.
- **Accessibility:** the canvas region is keyboard-operable (←/→ browse, Enter inspect, Esc return, +/- zoom), every control has a label, and a screen-reader list mirrors the rail.

## Caching and performance

- Catalogue reads (listings, facets, product detail, homepage, rail payload) use Redis read-through caching with short TTLs. Every admin mutation invalidates the `catalog:` prefix.
- Public API responses send `s-maxage`/`stale-while-revalidate`; uploaded assets and decoders are immutable and long-cached.
- three.js is code-split and loaded only for the showroom, the homepage preview (when it nears the viewport) and the product 3D tab.
- Pages read the session and use a per-request CSP nonce, so they are server-rendered on demand. Expensive data is cached underneath.

## Background jobs

`Job` rows are inserted **in the same transaction** as the business write (transactional outbox). Workers claim jobs with `FOR UPDATE SKIP LOCKED`, retry with exponential backoff and mark jobs `FAILED` after `maxAttempts`. Run `npm run worker` on long-lived hosts, or call `/api/cron/jobs` with `Authorization: Bearer $CRON_SECRET` from a scheduler on serverless platforms.
