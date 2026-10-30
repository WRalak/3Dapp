import Link from "next/link";
import { requireAdminPage, hasPermissions } from "@/lib/auth/guards";
import { financeOverview, reconcileWallets } from "@/server/services/finance.service";
import { resolveRange, salesBySeller } from "@/server/services/analytics.service";
import { db } from "@/lib/db/prisma";
import { PageHeader, StatCard } from "@/components/admin/shell";
import { ActionButton } from "@/components/admin/admin-ui";
import { Badge } from "@/components/ui/misc";
import { registerC2bAction } from "@/features/marketplace/actions";
import { c2bEnabled } from "@/features/payments/providers/mpesa-c2b";
import { formatDate, formatMoney } from "@/lib/utils";

export const metadata = { title: "Finance" };

export default async function Finance({ searchParams }: { searchParams: Promise<{ from?: string; to?: string }> }) {
  const user = await requireAdminPage("finance.view");
  const sp = await searchParams;
  const range = resolveRange(sp.from, sp.to, 30);
  const [o, recon, top, unmatched, ledger] = await Promise.all([
    financeOverview(range),
    reconcileWallets(),
    salesBySeller(range, 10),
    db.paymentTransaction.findMany({ where: { type: "C2B_CONFIRMATION", status: "UNMATCHED" }, orderBy: { createdAt: "desc" }, take: 20 }),
    db.platformTransaction.findMany({ orderBy: { createdAt: "desc" }, take: 30, include: { seller: { select: { businessName: true } } } }),
  ]);
  const drift = recon.filter((r) => !r.ok);
  const m = (c: number) => formatMoney(c);

  return (
    <>
      <PageHeader
        title="Finance"
        description={`${formatDate(range.from, { dateStyle: "medium" })} – ${formatDate(range.to, { dateStyle: "medium" })}`}
        actions={
          <>
            <Link href="/admin/finance/payouts" className="inline-flex h-9 items-center border px-3 text-sm">
              Payouts ({o.pendingPayouts.count})
            </Link>
            {hasPermissions(user, ["settings.manage"]) && c2bEnabled() && (
              <ActionButton size="sm" variant="outline" action={registerC2bAction} input={{}} confirm="Register Paybill confirmation/validation URLs with Safaricom?">
                Register M-Pesa C2B URLs
              </ActionButton>
            )}
          </>
        }
      />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="GMV (paid)" value={m(o.gmvCents)} />
        <StatCard label="Commission" value={m(o.commissionCents)} hint="Net of reversals" />
        <StatCard label="Platform-funded discounts" value={m(o.platformDiscountCents)} />
        <StatCard label="Refunds" value={m(o.refundsCents)} />
        <StatCard label="Paid to sellers" value={m(o.payoutsCents)} />
        <StatCard label="Owed to sellers" value={m(o.sellerLiabilities.pendingCents + o.sellerLiabilities.availableCents + o.sellerLiabilities.reservedCents)} hint={`${m(o.sellerLiabilities.availableCents)} withdrawable`} />
        <StatCard label="Pending payouts" value={m(o.pendingPayouts.amountCents)} hint={`${o.pendingPayouts.count} request(s)`} />
        <StatCard label="Failed payments" value={String(o.failedPayments)} hint="In this period" />
      </div>

      <section className="mt-10">
        <h2 className="mb-3 flex items-center gap-2 text-lg font-medium">
          Wallet reconciliation {drift.length === 0 ? <Badge tone="success">all {recon.length} wallets match the ledger</Badge> : <Badge tone="danger">{drift.length} mismatch(es)</Badge>}
        </h2>
        {drift.length > 0 && (
          <ul className="divide-y border border-danger/40 bg-danger/5 text-sm">
            {drift.map((d) => (
              <li key={d.sellerId} className="p-3">
                <Link href={`/admin/sellers/${d.sellerId}`} className="font-medium underline">
                  {d.sellerName}
                </Link>{" "}
                — pending {m(d.pending.wallet)} vs ledger {m(d.pending.ledger)}; available {m(d.available.wallet)} vs {m(d.available.ledger)}; reserved {m(d.reserved.wallet)} vs {m(d.reserved.ledger)}
              </li>
            ))}
          </ul>
        )}
      </section>

      {unmatched.length > 0 && (
        <section className="mt-10">
          <h2 className="mb-3 text-lg font-medium">Unmatched M-Pesa Paybill payments</h2>
          <p className="mb-3 text-sm text-taupe">Money received with a wrong account number or amount. Refund via the M-Pesa portal or allocate manually, then record it in the order notes.</p>
          <ul className="divide-y border bg-surface text-sm">
            {unmatched.map((t) => (
              <li key={t.id} className="flex justify-between p-3">
                <span>
                  {t.receipt} · account {String((t.raw as { BillRefNumber?: string } | null)?.BillRefNumber ?? "—")} · {t.phone}
                </span>
                <span className="tabular-nums">
                  {t.amountCents != null ? m(t.amountCents) : "—"} · {formatDate(t.createdAt, { dateStyle: "medium", timeStyle: "short" })}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="mt-10 grid gap-10 xl:grid-cols-2">
        <section>
          <h2 className="mb-3 text-lg font-medium">Top sellers</h2>
          <table className="w-full border bg-surface text-left text-sm">
            <thead className="border-b text-xs text-taupe">
              <tr>
                <th className="p-3 font-normal">Seller</th>
                <th className="p-3 font-normal">GMV</th>
                <th className="p-3 font-normal">Commission</th>
                <th className="p-3 font-normal">Net</th>
              </tr>
            </thead>
            <tbody>
              {top.map((r) => (
                <tr key={r.sellerId} className="border-b last:border-0">
                  <td className="p-3">{r.seller}</td>
                  <td className="p-3 tabular-nums">{m(r.gmvCents)}</td>
                  <td className="p-3 tabular-nums">{m(r.commissionCents)}</td>
                  <td className="p-3 tabular-nums">{m(r.netCents)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
        <section>
          <h2 className="mb-3 text-lg font-medium">Ledger (latest)</h2>
          <ul className="divide-y border bg-surface text-xs">
            {ledger.map((l) => (
              <li key={l.id} className="flex justify-between gap-3 p-2">
                <span>
                  <span className="font-medium">{l.type}</span> · {l.account} {l.seller && `· ${l.seller.businessName}`}
                  <span className="block text-taupe">
                    {l.description} · {formatDate(l.createdAt, { dateStyle: "short", timeStyle: "short" })}
                  </span>
                </span>
                <span className={l.amountCents < 0 ? "tabular-nums text-danger" : "tabular-nums"}>{m(l.amountCents)}</span>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </>
  );
}
