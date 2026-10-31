import "server-only";
import { db, type Tx } from "@/lib/db/prisma";
import { env } from "@/config/env";
import { AppError, badRequest, conflict, notFound } from "@/lib/errors";
import { decrypt } from "@/lib/security/crypto";
import { maskPhone } from "@/lib/utils";
import { splitRefund } from "@/features/finance/settlement";
import { getPayoutProvider } from "@/features/payouts/registry";
import type { AuthUser } from "@/lib/auth/guards";
import type { SellerContext } from "@/lib/auth/seller-guard";
import type { LedgerEntryType, Prisma } from "@/generated/prisma/client";
import { audit } from "./audit.service";
import { notify } from "./notification.service";

/**
 * Marketplace money movements. Every movement writes append-only PlatformTransaction rows
 * (the ledger) and adjusts the seller's wallet in the SAME database transaction, so the wallet
 * is always reconcilable against the ledger (see `reconcileWallets`).
 *
 * Accounts:
 *   PLATFORM_CASH     money held by the platform (customer payments in, refunds/payouts out)
 *   PLATFORM_REVENUE  commission earned, less platform-funded discounts
 *   SELLER_PENDING    seller earnings awaiting delivery + hold period
 *   SELLER_AVAILABLE  seller earnings that can be withdrawn
 *   SELLER_PAID       cumulative payouts sent to sellers
 *   TAX_PAYABLE       VAT collected on top of prices (tax-exclusive mode only)
 */
export const ACCOUNTS = ["PLATFORM_CASH", "PLATFORM_REVENUE", "SELLER_PENDING", "SELLER_AVAILABLE", "SELLER_PAID", "TAX_PAYABLE"] as const;
type Account = (typeof ACCOUNTS)[number];

interface Entry {
  type: LedgerEntryType;
  account: Account;
  amountCents: number;
  description: string;
  sellerId?: string | null;
  orderId?: string | null;
  sellerOrderId?: string | null;
  payoutId?: string | null;
  refundId?: string | null;
  actorId?: string | null;
}

async function post(tx: Tx, entries: Entry[]) {
  const rows = entries.filter((e) => e.amountCents !== 0);
  if (rows.length) await tx.platformTransaction.createMany({ data: rows.map((e) => ({ ...e, currency: env().STORE_CURRENCY })) });
}

async function ensureWallet(tx: Tx, sellerId: string) {
  return tx.sellerWallet.upsert({ where: { sellerId }, update: {}, create: { sellerId } });
}

/**
 * Called inside fulfilPayment's transaction once an order is confirmed paid. Accrues each
 * seller's commission and pending earnings. Idempotent via Commission.sellerOrderId (unique).
 */
export async function settlePaidOrder(tx: Tx, orderId: string) {
  const order = await tx.order.findUniqueOrThrow({ where: { id: orderId }, include: { sellerOrders: { include: { commission: true, seller: { select: { ownerId: true } } } } } });
  if (order.sellerOrders.some((so) => so.commission)) return; // already settled

  const e = env();
  const entries: Entry[] = [{ type: "ORDER_PAYMENT", account: "PLATFORM_CASH", amountCents: order.totalCents, orderId, description: `Payment for ${order.number}` }];
  let sellerTotals = 0;
  for (const so of order.sellerOrders) {
    sellerTotals += so.totalCents;
    const baseCents = so.subtotalCents - so.discountCents;
    await tx.commission.create({
      data: { sellerOrderId: so.id, sellerId: so.sellerId, rateBps: baseCents > 0 ? Math.round((so.commissionCents * 10_000) / baseCents) : 0, baseCents, amountCents: so.commissionCents },
    });
    await ensureWallet(tx, so.sellerId);
    await tx.sellerWallet.update({ where: { sellerId: so.sellerId }, data: { pendingCents: { increment: so.sellerNetCents }, lifetimeNetCents: { increment: so.sellerNetCents } } });
    await tx.sellerOrder.update({ where: { id: so.id }, data: { status: "PAID" } });
    entries.push(
      { type: "SELLER_EARNING", account: "SELLER_PENDING", amountCents: so.sellerNetCents, sellerId: so.sellerId, orderId, sellerOrderId: so.id, description: `Earnings for ${order.number}` },
      { type: "COMMISSION", account: "PLATFORM_REVENUE", amountCents: so.commissionCents, sellerId: so.sellerId, orderId, sellerOrderId: so.id, description: `Commission on ${order.number}` },
    );
    await tx.notification.create({
      data: { userId: so.seller.ownerId, type: "SELLER", title: "New paid order", body: `Order ${order.number} is paid — please prepare it for ${so.shippingMethodName.toLowerCase()}.`, link: `/seller/orders/${so.id}` },
    });
  }
  const tax = e.TAX_INCLUSIVE ? 0 : order.taxCents;
  if (tax) entries.push({ type: "ADJUSTMENT", account: "TAX_PAYABLE", amountCents: tax, orderId, description: `VAT on ${order.number}` });
  // Whatever the customer didn't pay relative to what sellers are owed was funded by the
  // platform (coupons, platform-wide promotions, free-delivery codes).
  const platformFunded = sellerTotals + tax - order.totalCents;
  if (platformFunded) entries.push({ type: "ADJUSTMENT", account: "PLATFORM_REVENUE", amountCents: -platformFunded, orderId, description: `Platform-funded discount on ${order.number}` });
  await post(tx, entries);
}

/** Earnings become withdrawable SELLER_PAYOUT_HOLD_DAYS after delivery (returns window). */
export async function releaseDueEarnings(now = new Date()) {
  const cutoff = new Date(now.getTime() - env().SELLER_PAYOUT_HOLD_DAYS * 86_400_000);
  const due = await db.sellerOrder.findMany({ where: { status: "DELIVERED", deliveredAt: { lte: cutoff }, earningsReleasedAt: null }, select: { id: true }, take: 500 });
  let released = 0;
  for (const { id } of due) {
    const ok = await db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "SellerOrder" WHERE id = ${id} FOR UPDATE`;
      const so = await tx.sellerOrder.findUniqueOrThrow({ where: { id }, include: { order: { select: { number: true } } } });
      if (so.earningsReleasedAt || so.status !== "DELIVERED") return false;
      const refunded = await refundedSellerShare(tx, so.id);
      const amount = so.sellerNetCents - refunded;
      await tx.sellerOrder.update({ where: { id }, data: { earningsReleasedAt: new Date() } });
      if (amount > 0) {
        await tx.sellerWallet.update({ where: { sellerId: so.sellerId }, data: { pendingCents: { decrement: amount }, availableCents: { increment: amount } } });
        await post(tx, [
          { type: "EARNING_RELEASE", account: "SELLER_PENDING", amountCents: -amount, sellerId: so.sellerId, sellerOrderId: so.id, description: `Released ${so.order.number}` },
          { type: "EARNING_RELEASE", account: "SELLER_AVAILABLE", amountCents: amount, sellerId: so.sellerId, sellerOrderId: so.id, description: `Released ${so.order.number}` },
        ]);
      }
      return true;
    });
    if (ok) released++;
  }
  return released;
}

async function refundedSellerShare(tx: Tx, sellerOrderId: string) {
  const agg = await tx.platformTransaction.aggregate({ where: { sellerOrderId, type: "SELLER_DEBIT", account: "SELLER_PENDING" }, _sum: { amountCents: true } });
  return -(agg._sum.amountCents ?? 0);
}

/**
 * Splits a completed customer refund on one seller order between the seller (debit) and the
 * platform (commission reversal). Debits pending earnings if not yet released, otherwise
 * available balance (which may go negative and is recovered from future earnings).
 */
export async function applySellerRefund(tx: Tx, input: { sellerOrderId: string; refundId: string; amountCents: number; actorId: string | null }) {
  const so = await tx.sellerOrder.findUniqueOrThrow({ where: { id: input.sellerOrderId }, include: { commission: true, order: { select: { number: true, id: true } } } });
  if (!so.commission) return; // never settled (unpaid) — nothing to claw back
  const { commissionReversalCents, sellerDebitCents } = splitRefund(input.amountCents, so);
  const account: Account = so.earningsReleasedAt ? "SELLER_AVAILABLE" : "SELLER_PENDING";
  await tx.sellerWallet.update({
    where: { sellerId: so.sellerId },
    data: {
      ...(account === "SELLER_PENDING" ? { pendingCents: { decrement: sellerDebitCents } } : { availableCents: { decrement: sellerDebitCents } }),
      lifetimeNetCents: { decrement: sellerDebitCents },
    },
  });
  const reversed = so.commission.reversedCents + commissionReversalCents;
  await tx.commission.update({ where: { id: so.commission.id }, data: { reversedCents: reversed, status: reversed >= so.commission.amountCents ? "REVERSED" : "PARTIALLY_REVERSED" } });
  const ref = { sellerId: so.sellerId, orderId: so.order.id, sellerOrderId: so.id, refundId: input.refundId, actorId: input.actorId };
  await post(tx, [
    { ...ref, type: "REFUND", account: "PLATFORM_CASH", amountCents: -input.amountCents, description: `Refund on ${so.order.number}` },
    { ...ref, type: "SELLER_DEBIT", account, amountCents: -sellerDebitCents, description: `Seller share of refund on ${so.order.number}` },
    { ...ref, type: "COMMISSION_REVERSAL", account: "PLATFORM_REVENUE", amountCents: -commissionReversalCents, description: `Commission reversed on ${so.order.number}` },
  ]);
}

// ─── Payouts ─────────────────────────────────────────────────────────────────

/** Seller requests a withdrawal: funds move available → reserved until finance pays them. */
export async function requestPayout(ctx: SellerContext, amountCents: number) {
  const e = env();
  if (!Number.isInteger(amountCents) || amountCents <= 0) throw badRequest("Enter a valid amount");
  if (amountCents < e.MIN_PAYOUT_CENTS) throw new AppError("VALIDATION", `The minimum payout is KSh ${(e.MIN_PAYOUT_CENTS / 100).toLocaleString("en-KE")}`, { amount: ["Below minimum"] });
  const profile = await db.sellerProfile.findUnique({ where: { sellerId: ctx.seller.id } });
  if (!profile) throw notFound("Seller profile");
  const destination =
    profile.payoutMethod === "MPESA"
      ? profile.payoutMpesaPhone && maskPhone(profile.payoutMpesaPhone)
      : profile.payoutAccountNumberEnc && `${profile.payoutBankName} ••••${decrypt(profile.payoutAccountNumberEnc, e.ENCRYPTION_KEY).slice(-4)}`;
  if (!destination) throw new AppError("VALIDATION", "Add your payout details first", { amount: ["Payout details missing"] });

  const payout = await db.$transaction(async (tx) => {
    // Conditional decrement: never lets two concurrent requests overdraw the balance.
    const claimed = await tx.$executeRaw`
      UPDATE "SellerWallet" SET "availableCents" = "availableCents" - ${amountCents}, "reservedCents" = "reservedCents" + ${amountCents}, "updatedAt" = now()
      WHERE "sellerId" = ${ctx.seller.id} AND "availableCents" >= ${amountCents}`;
    if (claimed === 0) throw new AppError("VALIDATION", "That's more than your available balance", { amount: ["Insufficient balance"] });
    const open = await tx.sellerPayout.count({ where: { sellerId: ctx.seller.id, status: { in: ["REQUESTED", "PROCESSING"] } } });
    if (open > 0) throw conflict("You already have a payout in progress");
    return tx.sellerPayout.create({ data: { sellerId: ctx.seller.id, amountCents, method: profile.payoutMethod, destination } });
  });
  await audit(ctx.user.id, "payout.requested", "SellerPayout", payout.id, { amountCents, method: payout.method });
  return payout;
}

/** Seller cancels a payout that finance hasn't started. */
export async function cancelPayout(ctx: SellerContext, payoutId: string) {
  await db.$transaction(async (tx) => {
    const p = await tx.sellerPayout.findFirst({ where: { id: payoutId, sellerId: ctx.seller.id } });
    if (!p) throw notFound("Payout");
    if (p.status !== "REQUESTED") throw badRequest("This payout is already being processed");
    await tx.sellerPayout.update({ where: { id: p.id }, data: { status: "CANCELLED", processedAt: new Date() } });
    await tx.sellerWallet.update({ where: { sellerId: p.sellerId }, data: { reservedCents: { decrement: p.amountCents }, availableCents: { increment: p.amountCents } } });
  });
  await audit(ctx.user.id, "payout.cancelled", "SellerPayout", payoutId);
}

/**
 * Finance processes a payout. `manual`: staff sent the money (bank/M-Pesa business app) and
 * record the reference. Automated providers (M-Pesa B2C) are initiated here and completed by
 * their verified result callback via `completePayout`.
 */
export async function processPayout(payoutId: string, input: { action: "paid" | "failed" | "initiate"; reference?: string; reason?: string }, actor: AuthUser) {
  const p = await db.sellerPayout.findUnique({ where: { id: payoutId }, include: { seller: { include: { profile: true } } } });
  if (!p) throw notFound("Payout");
  if (!["REQUESTED", "PROCESSING"].includes(p.status)) throw conflict(`This payout is already ${p.status.toLowerCase()}`);
  // KYC: no money leaves the platform until the seller's national ID has been verified.
  if (input.action !== "failed") {
    const kyc = await db.sellerDocument.count({ where: { sellerId: p.sellerId, type: "NATIONAL_ID", status: "ACCEPTED" } });
    if (!kyc) throw badRequest("Verify the seller's national ID before paying out");
  }

  if (input.action === "initiate") {
    const provider = getPayoutProvider("mpesa-b2c");
    if (!provider.isEnabled()) throw badRequest("M-Pesa B2C is not configured — pay manually and record the reference");
    if (p.method !== "MPESA" || !p.seller.profile?.payoutMpesaPhone) throw badRequest("This payout isn't to an M-Pesa number");
    const res = await provider.send({ payoutId: p.id, amountCents: p.amountCents, phone: p.seller.profile.payoutMpesaPhone, remarks: `3Dapp payout ${p.id.slice(-6)}` });
    await db.sellerPayout.update({ where: { id: p.id }, data: { status: "PROCESSING", provider: "mpesa-b2c", reference: res.reference, processedById: actor.id } });
    await audit(actor.id, "payout.initiated", "SellerPayout", p.id, { provider: "mpesa-b2c", reference: res.reference });
    return;
  }
  if (input.action === "paid" && !input.reference?.trim()) throw new AppError("VALIDATION", "Enter the transaction reference", { reference: ["Required"] });
  if (input.action === "failed" && !input.reason?.trim()) throw new AppError("VALIDATION", "Enter a reason", { reason: ["Required"] });
  await completePayout(p.id, input.action === "paid" ? { ok: true, reference: input.reference!.trim() } : { ok: false, reason: input.reason!.trim() }, actor.id);
}

/** Final state for a payout (manual record or verified provider callback). Idempotent. */
export async function completePayout(payoutId: string, result: { ok: true; reference: string } | { ok: false; reason: string }, actorId: string | null) {
  const done = await db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "SellerPayout" WHERE id = ${payoutId} FOR UPDATE`;
    const p = await tx.sellerPayout.findUniqueOrThrow({ where: { id: payoutId }, include: { seller: { select: { ownerId: true } } } });
    if (!["REQUESTED", "PROCESSING"].includes(p.status)) return null;
    if (result.ok) {
      await tx.sellerPayout.update({ where: { id: p.id }, data: { status: "PAID", reference: result.reference, processedAt: new Date(), processedById: actorId ?? p.processedById } });
      await tx.sellerWallet.update({ where: { sellerId: p.sellerId }, data: { reservedCents: { decrement: p.amountCents }, paidOutCents: { increment: p.amountCents } } });
      await post(tx, [
        { type: "PAYOUT", account: "SELLER_AVAILABLE", amountCents: -p.amountCents, sellerId: p.sellerId, payoutId: p.id, actorId, description: `Payout ${result.reference}` },
        { type: "PAYOUT", account: "SELLER_PAID", amountCents: p.amountCents, sellerId: p.sellerId, payoutId: p.id, actorId, description: `Payout ${result.reference}` },
        { type: "PAYOUT", account: "PLATFORM_CASH", amountCents: -p.amountCents, sellerId: p.sellerId, payoutId: p.id, actorId, description: `Payout ${result.reference}` },
      ]);
      await notify(p.seller.ownerId, "PAYOUT", "Payout sent", `KSh ${(p.amountCents / 100).toLocaleString("en-KE")} was sent to ${p.destination} (ref ${result.reference}).`, "/seller/earnings", tx);
    } else {
      await tx.sellerPayout.update({ where: { id: p.id }, data: { status: "FAILED", failureReason: result.reason, processedAt: new Date(), processedById: actorId ?? p.processedById } });
      await tx.sellerWallet.update({ where: { sellerId: p.sellerId }, data: { reservedCents: { decrement: p.amountCents }, availableCents: { increment: p.amountCents } } });
      await notify(p.seller.ownerId, "PAYOUT", "Payout failed", `Your payout couldn't be completed: ${result.reason}. The funds are back in your available balance.`, "/seller/earnings", tx);
    }
    return p;
  });
  if (done) await audit(actorId, result.ok ? "payout.paid" : "payout.failed", "SellerPayout", payoutId, result.ok ? { reference: result.reference } : { reason: result.reason });
}

// ─── Reporting ───────────────────────────────────────────────────────────────

export async function sellerEarnings(sellerId: string) {
  const [wallet, payouts, ledger] = await Promise.all([
    db.sellerWallet.findUnique({ where: { sellerId } }),
    db.sellerPayout.findMany({ where: { sellerId }, orderBy: { requestedAt: "desc" }, take: 50 }),
    db.platformTransaction.findMany({ where: { sellerId, account: { in: ["SELLER_PENDING", "SELLER_AVAILABLE"] } }, orderBy: { createdAt: "desc" }, take: 100 }),
  ]);
  const n = (v: bigint | undefined) => Number(v ?? 0n);
  return {
    wallet: { pendingCents: n(wallet?.pendingCents), availableCents: n(wallet?.availableCents), reservedCents: n(wallet?.reservedCents), lifetimeNetCents: n(wallet?.lifetimeNetCents), paidOutCents: n(wallet?.paidOutCents) },
    payouts,
    ledger,
  };
}

export async function financeOverview(range: { from: Date; to: Date }) {
  const where = { createdAt: { gte: range.from, lt: range.to } };
  const [byType, byAccount, pendingPayouts, failedPayments, wallets] = await Promise.all([
    db.platformTransaction.groupBy({ by: ["type", "account"], where, _sum: { amountCents: true } }),
    db.platformTransaction.groupBy({ by: ["account"], _sum: { amountCents: true } }),
    db.sellerPayout.aggregate({ where: { status: { in: ["REQUESTED", "PROCESSING"] } }, _sum: { amountCents: true }, _count: true }),
    db.payment.count({ where: { status: "FAILED", ...where } }),
    db.sellerWallet.aggregate({ _sum: { pendingCents: true, availableCents: true, reservedCents: true } }),
  ]);
  const sum = (type: LedgerEntryType, account: Account) => byType.find((r) => r.type === type && r.account === account)?._sum.amountCents ?? 0;
  return {
    gmvCents: sum("ORDER_PAYMENT", "PLATFORM_CASH"),
    commissionCents: sum("COMMISSION", "PLATFORM_REVENUE") + sum("COMMISSION_REVERSAL", "PLATFORM_REVENUE"),
    platformDiscountCents: -sum("ADJUSTMENT", "PLATFORM_REVENUE"),
    refundsCents: -sum("REFUND", "PLATFORM_CASH"),
    payoutsCents: sum("PAYOUT", "SELLER_PAID"),
    balances: Object.fromEntries(byAccount.map((r) => [r.account, r._sum.amountCents ?? 0])) as Record<string, number>,
    pendingPayouts: { count: pendingPayouts._count, amountCents: pendingPayouts._sum.amountCents ?? 0 },
    failedPayments,
    sellerLiabilities: {
      pendingCents: Number(wallets._sum.pendingCents ?? 0n),
      availableCents: Number(wallets._sum.availableCents ?? 0n),
      reservedCents: Number(wallets._sum.reservedCents ?? 0n),
    },
  };
}

/**
 * Reconciliation: recompute every wallet from the ledger and report drift. Wallet columns are
 * a cache of the ledger; any mismatch indicates a bug or tampering and is surfaced to finance.
 */
export async function reconcileWallets() {
  const [wallets, sums, reserved] = await Promise.all([
    db.sellerWallet.findMany({ include: { seller: { select: { businessName: true } } } }),
    db.platformTransaction.groupBy({ by: ["sellerId", "account"], where: { sellerId: { not: null }, account: { in: ["SELLER_PENDING", "SELLER_AVAILABLE"] } }, _sum: { amountCents: true } }),
    db.sellerPayout.groupBy({ by: ["sellerId"], where: { status: { in: ["REQUESTED", "PROCESSING"] } }, _sum: { amountCents: true } }),
  ]);
  const ledger = (sellerId: string, account: string) => sums.find((s) => s.sellerId === sellerId && s.account === account)?._sum.amountCents ?? 0;
  return wallets
    .map((w) => {
      const res = reserved.find((r) => r.sellerId === w.sellerId)?._sum.amountCents ?? 0;
      const expectedPending = ledger(w.sellerId, "SELLER_PENDING");
      // Available in the ledger still includes reserved (not yet paid) amounts.
      const expectedAvailable = ledger(w.sellerId, "SELLER_AVAILABLE") - res;
      return {
        sellerId: w.sellerId,
        sellerName: w.seller.businessName,
        pending: { wallet: Number(w.pendingCents), ledger: expectedPending },
        available: { wallet: Number(w.availableCents), ledger: expectedAvailable },
        reserved: { wallet: Number(w.reservedCents), ledger: res },
      };
    })
    .map((r) => ({ ...r, ok: r.pending.wallet === r.pending.ledger && r.available.wallet === r.available.ledger && r.reserved.wallet === r.reserved.ledger }));
}

export type LedgerFilter = Prisma.PlatformTransactionWhereInput;
