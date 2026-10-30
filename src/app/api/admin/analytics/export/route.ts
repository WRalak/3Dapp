import { route } from "@/lib/api";
import { requirePermission } from "@/lib/auth/guards";
import { badRequest } from "@/lib/errors";
import { analyticsRangeSchema } from "@/lib/validation/admin";
import { audit } from "@/server/services/audit.service";
import {
  customerAcquisition,
  inventoryPerformance,
  productPerformance,
  resolveRange,
  revenueSeries,
  salesByCategory,
  toCsv,
} from "@/server/services/analytics.service";

export const dynamic = "force-dynamic";

const REPORTS = ["revenue", "products", "categories", "customers", "inventory"] as const;

export const GET = route(async (req) => {
  const user = await requirePermission("analytics.view");
  const url = new URL(req.url);
  const report = url.searchParams.get("report") as (typeof REPORTS)[number];
  if (!REPORTS.includes(report)) throw badRequest("Unknown report");
  const parsed = analyticsRangeSchema.safeParse({ from: url.searchParams.get("from") ?? undefined, to: url.searchParams.get("to") ?? undefined });
  if (!parsed.success) throw badRequest("Invalid date range");
  const range = resolveRange(parsed.data.from, parsed.data.to);

  let rows: Record<string, string | number | null>[];
  switch (report) {
    case "revenue":
      rows = (await revenueSeries(range)).map((r) => ({ date: r.date, revenue: (r.revenueCents / 100).toFixed(2), orders: r.orders }));
      break;
    case "products":
      rows = (await productPerformance(range, 500)).map((r) => ({ product: r.name, revenue: (r.revenueCents / 100).toFixed(2), units: r.units, views: r.views, conversion: r.conversion.toFixed(4) }));
      break;
    case "categories":
      rows = (await salesByCategory(range)).map((r) => ({ category: r.category, revenue: (r.revenueCents / 100).toFixed(2), units: r.units }));
      break;
    case "customers":
      rows = await customerAcquisition(range);
      break;
    case "inventory":
      rows = (await inventoryPerformance(500)).map((r) => ({ product: r.name, on_hand: r.onHand, reserved: r.reserved, sold_30d: r.sold30, days_of_cover: r.daysOfCover }));
      break;
  }
  await audit(user.id, "analytics.exported", "Report", report, { from: range.from, to: range.to });
  const name = `atelier-${report}-${range.from.toISOString().slice(0, 10)}-${range.to.toISOString().slice(0, 10)}.csv`;
  return new Response(toCsv(rows), {
    headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": `attachment; filename="${name}"`, "cache-control": "private, no-store" },
  });
});
