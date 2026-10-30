import "server-only";
import { db } from "@/lib/db/prisma";
import { cache, CacheKeys } from "@/lib/cache/redis";
import type { AnalyticsEventType } from "@/generated/prisma/client";

export interface DateRange {
  from: Date;
  to: Date;
}

export function resolveRange(from?: string, to?: string, defaultDays = 30): DateRange {
  const end = to ? new Date(`${to}T23:59:59.999Z`) : new Date();
  const start = from ? new Date(`${from}T00:00:00.000Z`) : new Date(end.getTime() - (defaultDays - 1) * 86400_000);
  start.setUTCHours(0, 0, 0, 0);
  if (start > end) return { from: end, to: start };
  return { from: start, to: end };
}

const PAID = ["PAID", "PROCESSING", "SHIPPED", "DELIVERED"] as const;

/** Headline KPIs for the admin overview — all computed from live data. */
export async function getDashboardStats() {
  return cache.getOrSet(CacheKeys.dashboard, 30, async () => {
    const [revenue, totalOrders, customers, products, pending, completed, recentPayments, statusCounts] = await Promise.all([
      db.order.aggregate({ where: { status: { in: [...PAID] } }, _sum: { totalCents: true } }),
      db.order.count(),
      db.user.count({ where: { isStaff: false, deletedAt: null } }),
      db.product.count({ where: { deletedAt: null } }),
      db.order.count({ where: { status: { in: ["PENDING_PAYMENT", "PAID", "PROCESSING"] } } }),
      db.order.count({ where: { status: "DELIVERED" } }),
      db.payment.findMany({
        orderBy: { createdAt: "desc" },
        take: 8,
        select: { id: true, provider: true, status: true, amountCents: true, currency: true, createdAt: true, order: { select: { number: true, customerName: true } } },
      }),
      db.order.groupBy({ by: ["status"], _count: { _all: true } }),
    ]);
    return {
      revenueCents: revenue._sum.totalCents ?? 0,
      totalOrders,
      customers,
      products,
      pending,
      completed,
      recentPayments: recentPayments.map((p) => ({ ...p, createdAt: p.createdAt.toISOString() })),
      statusCounts: statusCounts.map((s) => ({ status: s.status, count: s._count._all })),
    };
  });
}

/** Daily revenue and order counts (zero-filled) for charts. */
export async function revenueSeries(range: DateRange) {
  const rows = await db.$queryRaw<{ day: Date; revenue: bigint; orders: bigint }[]>`
    SELECT date_trunc('day', "placedAt") AS day,
           COALESCE(SUM("totalCents") FILTER (WHERE status IN ('PAID','PROCESSING','SHIPPED','DELIVERED')), 0)::bigint AS revenue,
           COUNT(*)::bigint AS orders
    FROM "Order"
    WHERE "placedAt" BETWEEN ${range.from} AND ${range.to}
    GROUP BY 1 ORDER BY 1`;
  const byDay = new Map(rows.map((r) => [r.day.toISOString().slice(0, 10), r]));
  const out: { date: string; revenueCents: number; orders: number }[] = [];
  for (let d = new Date(range.from); d <= range.to; d = new Date(d.getTime() + 86400_000)) {
    const key = d.toISOString().slice(0, 10);
    const r = byDay.get(key);
    out.push({ date: key, revenueCents: Number(r?.revenue ?? 0), orders: Number(r?.orders ?? 0) });
  }
  return out;
}

export async function customerAcquisition(range: DateRange) {
  const rows = await db.$queryRaw<{ day: Date; count: bigint }[]>`
    SELECT date_trunc('day', "createdAt") AS day, COUNT(*)::bigint AS count
    FROM "User" WHERE "isStaff" = false AND "createdAt" BETWEEN ${range.from} AND ${range.to}
    GROUP BY 1 ORDER BY 1`;
  const byDay = new Map(rows.map((r) => [r.day.toISOString().slice(0, 10), Number(r.count)]));
  const out: { date: string; customers: number }[] = [];
  for (let d = new Date(range.from); d <= range.to; d = new Date(d.getTime() + 86400_000)) {
    const key = d.toISOString().slice(0, 10);
    out.push({ date: key, customers: byDay.get(key) ?? 0 });
  }
  return out;
}

export async function analyticsSummary(range: DateRange) {
  const [paid, visitors, buyers, newCustomers] = await Promise.all([
    db.order.aggregate({ where: { status: { in: [...PAID] }, placedAt: { gte: range.from, lte: range.to } }, _sum: { totalCents: true }, _count: { _all: true } }),
    db.analyticsEvent.findMany({ where: { type: "SESSION_START", createdAt: { gte: range.from, lte: range.to } }, distinct: ["visitorId"], select: { visitorId: true } }),
    db.analyticsEvent.findMany({ where: { type: "ORDER_PLACED", createdAt: { gte: range.from, lte: range.to } }, distinct: ["visitorId"], select: { visitorId: true } }),
    db.user.count({ where: { isStaff: false, createdAt: { gte: range.from, lte: range.to } } }),
  ]);
  const revenue = paid._sum.totalCents ?? 0;
  const orders = paid._count._all;
  return {
    revenueCents: revenue,
    orders,
    averageOrderValueCents: orders ? Math.round(revenue / orders) : 0,
    visitors: visitors.length,
    conversionRate: visitors.length ? buyers.length / visitors.length : 0,
    newCustomers,
  };
}

export async function salesByCategory(range: DateRange) {
  const rows = await db.$queryRaw<{ category: string; revenue: bigint; units: bigint }[]>`
    SELECT c.name AS category, SUM(oi."totalCents")::bigint AS revenue, SUM(oi.quantity)::bigint AS units
    FROM "OrderItem" oi
    JOIN "Order" o ON o.id = oi."orderId" AND o.status IN ('PAID','PROCESSING','SHIPPED','DELIVERED')
    JOIN "Product" p ON p.id = oi."productId"
    JOIN "Category" c ON c.id = p."categoryId"
    WHERE o."placedAt" BETWEEN ${range.from} AND ${range.to}
    GROUP BY c.name ORDER BY revenue DESC`;
  return rows.map((r) => ({ category: r.category, revenueCents: Number(r.revenue), units: Number(r.units) }));
}

export async function productPerformance(range: DateRange, take = 10) {
  const rows = await db.$queryRaw<{ productId: string; name: string; revenue: bigint; units: bigint; views: bigint }[]>`
    SELECT p.id AS "productId", p.name,
           COALESCE(s.revenue, 0)::bigint AS revenue, COALESCE(s.units, 0)::bigint AS units, COALESCE(v.views, 0)::bigint AS views
    FROM "Product" p
    LEFT JOIN (
      SELECT oi."productId", SUM(oi."totalCents") AS revenue, SUM(oi.quantity) AS units
      FROM "OrderItem" oi JOIN "Order" o ON o.id = oi."orderId"
      WHERE o.status IN ('PAID','PROCESSING','SHIPPED','DELIVERED') AND o."placedAt" BETWEEN ${range.from} AND ${range.to}
      GROUP BY oi."productId"
    ) s ON s."productId" = p.id
    LEFT JOIN (
      SELECT "productId", COUNT(*) AS views FROM "AnalyticsEvent"
      WHERE type = 'PRODUCT_VIEW' AND "createdAt" BETWEEN ${range.from} AND ${range.to}
      GROUP BY "productId"
    ) v ON v."productId" = p.id
    WHERE p."deletedAt" IS NULL
    ORDER BY revenue DESC, views DESC
    LIMIT ${take}`;
  return rows.map((r) => ({
    productId: r.productId,
    name: r.name,
    revenueCents: Number(r.revenue),
    units: Number(r.units),
    views: Number(r.views),
    conversion: Number(r.views) ? Number(r.units) / Number(r.views) : 0,
  }));
}

export async function inventoryPerformance(take = 10) {
  const rows = await db.$queryRaw<{ productId: string; name: string; onHand: bigint; reserved: bigint; sold30: bigint }[]>`
    SELECT p.id AS "productId", p.name,
           SUM(i.quantity)::bigint AS "onHand", SUM(i.reserved)::bigint AS reserved,
           COALESCE((SELECT -SUM(m.quantity) FROM "InventoryMovement" m JOIN "Inventory" i2 ON i2.id = m."inventoryId"
                     JOIN "ProductVariant" v2 ON v2.id = i2."variantId"
                     WHERE v2."productId" = p.id AND m.type = 'SALE' AND m."createdAt" > now() - interval '30 days'), 0)::bigint AS sold30
    FROM "Product" p
    JOIN "ProductVariant" v ON v."productId" = p.id AND v."deletedAt" IS NULL
    JOIN "Inventory" i ON i."variantId" = v.id
    WHERE p."deletedAt" IS NULL
    GROUP BY p.id, p.name
    ORDER BY sold30 DESC, "onHand" ASC
    LIMIT ${take}`;
  return rows.map((r) => {
    const sold = Number(r.sold30);
    const onHand = Number(r.onHand);
    return { productId: r.productId, name: r.name, onHand, reserved: Number(r.reserved), sold30: sold, daysOfCover: sold ? Math.round((onHand / sold) * 30) : null };
  });
}

export async function bestSellers(take = 5) {
  const rows = await db.product.findMany({ where: { deletedAt: null }, orderBy: { salesCount: "desc" }, take, select: { id: true, name: true, salesCount: true, slug: true } });
  return rows;
}

export async function trackEvent(type: AnalyticsEventType, visitorId: string, opts: { userId?: string | null; productId?: string | null } = {}) {
  await db.analyticsEvent.create({ data: { type, visitorId, userId: opts.userId ?? null, productId: opts.productId ?? null } }).catch(() => undefined);
}

export function toCsv(rows: Record<string, string | number | null>[]) {
  if (rows.length === 0) return "";
  const headers = Object.keys(rows[0]!);
  // Neutralise spreadsheet formula injection (=, +, -, @ prefixes).
  const esc = (v: string | number | null) => {
    let s = v == null ? "" : String(v);
    if (typeof v === "string" && /^[=+\-@\t\r]/.test(s)) s = `'${s}`;
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [headers.join(","), ...rows.map((r) => headers.map((h) => esc(r[h] ?? null)).join(","))].join("\n");
}
