# Marketplace design (Kenya)

Mtindo is a multi-vendor marketplace: independent Kenyan designers, tailors and boutiques sell through one storefront, customers pay Mtindo once (M-Pesa, card or PayPal), and Mtindo pays each seller their share after delivery. This document explains how that works and why.

## Sellers

| Step | What happens | Code |
|---|---|---|
| Apply | A signed-in user submits `/sell` (business, county/town, categories, optional KRA PIN / BRS number). One seller per user. Re-applying after rejection resubmits the same record. | `seller.service.ts › applyAsSeller` |
| Verify | The applicant uploads ID / KRA PIN / registration documents. Files go **directly to private storage** under `private/documents/…` via a signed URL, are magic-byte checked (PDF/JPEG/PNG), and are never served by `/media`. Staff open them through `/api/admin/seller-documents/[id]`, which requires `sellers.view` and writes an audit entry per view. | `addSellerDocument`, `readSellerDocument` |
| Decide | Staff approve, reject, request changes, suspend or reactivate. Every decision is appended to `SellerVerification` (DB trigger: append-only), audited, and notified to the seller. Approval grants the `SELLER` role. | `decideSeller` |
| Operate | Approved sellers use `/seller`: products (with photo upload), inventory, orders, messages, delivery zones, earnings & payouts, store profile. | `src/app/seller/*` |

**Seller isolation.** The seller is always resolved from the session (`requireSeller` / `requireSellerPage`), never from a URL or form field. Every seller query filters by that `seller.id`, and a foreign id simply returns 404 (product edit, order view, inquiry, delivery zone, payout, image). The product form's `sellerId` field is ignored for sellers and only honoured for staff. Integration tests cover cross-seller edits and fulfilment.

**Listing moderation.** New seller listings start as `PENDING_REVIEW`. The storefront shows a product only when it is `PUBLISHED` **and** `APPROVED` **and** its seller is `APPROVED` and not deleted (`publishedWhere()`, `isPurchasable()`, and the full-text search SQL). Suspending a seller therefore hides all of their products instantly. Editing a rejected listing resubmits it; edits to approved listings stay live and are audited. Customers can report listings (counterfeit, misleading, copied design, offensive); staff resolve reports and can pull a listing.

## Orders: one payment, many sellers

```
Order (what the customer pays: MT-YYMMDD-XXXXX)
 ├─ SellerOrder  Kitenge House   items · delivery (same-day rider) · commission · seller net
 └─ SellerOrder  Pwani Threads   items · delivery (courier)        · commission · seller net
```

- The cart groups lines by seller; each seller ships separately with their own delivery method.
- `placeOrder` recomputes everything server-side: unit prices, automatic campaigns (best single promotion per line), the platform coupon, each seller's delivery fee for the destination county/town, VAT (inclusive by default), and commission per line (`seller override > category rate > DEFAULT_COMMISSION_BPS`). The client only submits choices: address, one delivery method per seller, payment method.
- Sellers move their own sub-order `PAID → PROCESSING → SHIPPED → DELIVERED` (pickup sub-orders become "ready for collection"). The parent order's status is derived: it is only *Delivered* once every non-cancelled seller has delivered (`parentStatusFrom`).
- Shipments belong to a seller order and carry a tracking timeline. Couriers plug in through the shipping-provider abstraction (`features/delivery/providers.ts`); today the `manual` provider records the courier and waybill.

## Money

### Why integer cents, not `Decimal`

All money is stored as **integer KES cents** (`Int`; wallet balances `BigInt`). This meets the brief's intent ("never floats") more strictly than `Decimal`: values are exact, arithmetic happens in integers in both SQL and TypeScript (no `Decimal.js` round-trips or accidental `Number()` conversions), and every column has CHECK constraints. Display formatting (`formatMoney`, e.g. `KSh 1,500`) is the only place cents become shillings. M-Pesa moves whole shillings, so M-Pesa amounts are compared at shilling precision.

### Ledger

`PlatformTransaction` is an append-only ledger (DB trigger). Seller wallets are a cache of it, updated **in the same transaction** as each ledger posting.

| Event | Postings |
|---|---|
| Payment confirmed (`settlePaidOrder`) | `PLATFORM_CASH +total` · per seller `SELLER_PENDING +net` and `PLATFORM_REVENUE +commission` · `PLATFORM_REVENUE −platform-funded discount` (coupons, platform campaigns, free-delivery codes) · `TAX_PAYABLE +VAT` (tax-exclusive mode only) |
| Delivered + `SELLER_PAYOUT_HOLD_DAYS` (`finance.releaseEarnings` job) | `SELLER_PENDING −net` · `SELLER_AVAILABLE +net` |
| Refund on a seller order (`applySellerRefund`) | `PLATFORM_CASH −refund` · seller share debited (pending or available) · `PLATFORM_REVENUE −commission reversed` (proportional, `splitRefund`) |
| Payout paid (`completePayout`) | `SELLER_AVAILABLE −amount` · `SELLER_PAID +amount` · `PLATFORM_CASH −amount` |

Invariants: per order, `cash = Σ seller net + Σ commission − platform-funded discounts (+ VAT)`. Seller-funded campaigns reduce the seller's commission base; platform-funded ones never reduce seller earnings. **Reconciliation** (`reconcileWallets`, shown on `/admin/finance`) recomputes every wallet from the ledger and flags any drift. Integration tests assert balanced ledgers, idempotent settlement, refund clawback and post-payout reconciliation.

### Payouts

1. The seller requests a payout (minimum `MIN_PAYOUT_CENTS`). A conditional `UPDATE … WHERE availableCents >= amount` moves funds `available → reserved`, so concurrent requests cannot overdraw. One open payout at a time.
2. Finance (`finance.payouts`) — only after the seller's national ID document is accepted (enforced server-side) — either:
   - **manual**: sends the money (bank, or the M-Pesa business app) and records the transaction reference; or
   - **M-Pesa B2C**: once Safaricom enables B2C on the shortcode and `MPESA_B2C_*` is set, initiates the transfer. The result arrives at a signed per-payout callback URL, and the ConversationID must match.
3. Paid → ledger postings and a seller notification; failed → funds return to available. Payout-destination changes are audited, and bank account numbers are AES-GCM encrypted.

## M-Pesa

- **STK Push (Lipa na M-Pesa Online).** Per-payment HMAC-signed callback URL. The CheckoutRequestID must match, success is confirmed with an STK Push Query, the paid amount is checked, and every callback is recorded in `PaymentTransaction` (receipt, masked phone).
- **C2B (Paybill / Till).** Customers can pay from the SIM menu using the **order number as the account number**. Validation accepts only an open order with the exact (rounded-up) shilling amount. Confirmation is idempotent on the M-Pesa receipt (`TransID`, unique). Unmatched money (wrong account or amount) is kept as `UNMATCHED` for finance to refund or allocate — it never auto-fulfils anything. C2B callbacks are unsigned, so the registered URLs embed an HMAC path secret and can be IP-allow-listed (`MPESA_ALLOWED_IPS`). Register the URLs once from **Admin → Finance**.
- Daraja credentials live only in server env; nothing payment-related trusts the browser.

## Delivery

Each seller defines **zones** (counties, optionally narrowed to towns) with **methods**: same-day (with an EAT cut-off hour), next-day, standard, courier, seller-arranged, or pickup (with an address), each with a price, an optional free-over threshold and an ETA range. `deliveryOptionsFor` is pure and unit-tested. Pickup is always offered. If a seller doesn't cover the customer's county, checkout says so for that seller only. Addresses are Kenyan-shaped: county → town/area → estate → building → directions for the rider, plus a verified phone.

## Localisation and low-bandwidth

- **Currency:** KES by default (`KSh 1,500`). `config/locale.ts` holds an extensible currency table (UGX, TZS, RWF, USD) for future regional expansion. Dates use `Africa/Nairobi`.
- **Languages:** English (Kenya) and Kiswahili dictionaries (`src/i18n`). The locale comes from a cookie (set by the footer switcher, and saved to the user profile when signed in) or `Accept-Language`. We deliberately did **not** add `/sw/...` URL prefixes: that would duplicate every route and complicate the per-request CSP nonce, for little SEO benefit in a market where most shoppers arrive from social links. Moving to prefixed routes later only touches `getLocale()` and the links.
- **Lite mode** (cookie, toggle in the footer, and suggested automatically on 2G/3G or data-saver connections): the 3D rail and model downloads are disabled (2D gallery instead), card images use lower quality, and hover images are skipped. Pages work fully without 3D. **3D is never required to buy.**

## Representing fabric honestly

We never imply a 3D model shows the real fabric unless it does. `ProductModel3D.representation` is `ACCURATE` (built from the real garment) or `ILLUSTRATIVE` (a generic silhouette in the main colour). Product pages and the 3D inspect panel show a notice when the model is illustrative or when there is no real photography. Generated placeholder galleries no longer include a fake "fabric detail" image. Seeded models are all `ILLUSTRATIVE`.

## Cultural respect

Category and collection copy describes garments, makers and techniques (kitenge, kikoi, kanga, kiondo, beadwork) and credits the artisans who make them. It avoids "tribal"/"exotic" framing and does not present any community's dress as a costume. Product reports include "culturally disrespectful" so customers can flag listings that fall short.
