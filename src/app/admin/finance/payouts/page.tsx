import Link from "next/link";
import { requireAdminPage, hasPermissions } from "@/lib/auth/guards";
import { db } from "@/lib/db/prisma";
import { getPayoutProvider } from "@/features/payouts/registry";
import { PageHeader } from "@/components/admin/shell";
import { ActionButton } from "@/components/admin/admin-ui";
import { StatusPill } from "@/components/ui/misc";
import { processPayoutAction } from "@/features/marketplace/actions";
import { formatDate, formatMoney } from "@/lib/utils";

export const metadata = { title: "Payouts" };

export default async function Payouts({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const user = await requireAdminPage("finance.view");
  const { status = "open" } = await searchParams;
  const canPay = hasPermissions(user, ["finance.payouts"]);
  const b2c = getPayoutProvider("mpesa-b2c").isEnabled();
  const payouts = await db.sellerPayout.findMany({
    where: status === "open" ? { status: { in: ["REQUESTED", "PROCESSING"] } } : { status: { in: ["PAID", "FAILED", "CANCELLED"] } },
    orderBy: { requestedAt: status === "open" ? "asc" : "desc" },
    take: 100,
    include: { seller: { select: { id: true, businessName: true, documents: { where: { status: "ACCEPTED" }, select: { type: true } } } }, processedBy: { select: { name: true, email: true } } },
  });
  return (
    <>
      <PageHeader title="Seller payouts" description="Send the money (M-Pesa B2C, bank or M-Pesa business app), then record the transaction reference. Every action is audited." />
      <nav className="mb-4 flex gap-1 border-b text-sm">
        {[
          ["open", "To process"],
          ["done", "History"],
        ].map(([k, l]) => (
          <Link key={k} href={`/admin/finance/payouts?status=${k}`} className={k === status ? "border-b-2 border-ink px-3 py-2" : "px-3 py-2 text-taupe"}>
            {l}
          </Link>
        ))}
      </nav>
      <div className="overflow-x-auto border bg-surface">
        <table className="w-full text-left text-sm">
          <thead className="border-b text-xs text-taupe">
            <tr>
              <th className="p-3 font-normal">Seller</th>
              <th className="p-3 font-normal">Amount</th>
              <th className="p-3 font-normal">To</th>
              <th className="p-3 font-normal">Requested</th>
              <th className="p-3 font-normal">Status</th>
              <th className="p-3" />
            </tr>
          </thead>
          <tbody>
            {payouts.length === 0 && (
              <tr>
                <td colSpan={6} className="p-6 text-center text-taupe">
                  Nothing to show.
                </td>
              </tr>
            )}
            {payouts.map((p) => {
              const verified = p.seller.documents.some((d) => d.type === "NATIONAL_ID");
              return (
                <tr key={p.id} className="border-b last:border-0">
                  <td className="p-3">
                    <Link href={`/admin/sellers/${p.seller.id}`} className="underline-offset-4 hover:underline">
                      {p.seller.businessName}
                    </Link>
                    {!verified && <span className="block text-xs text-warning">ID not verified</span>}
                  </td>
                  <td className="p-3 tabular-nums">{formatMoney(p.amountCents)}</td>
                  <td className="p-3">
                    {p.method === "MPESA" ? "M-Pesa" : "Bank"} · {p.destination}
                  </td>
                  <td className="p-3 text-xs">
                    {formatDate(p.requestedAt, { dateStyle: "medium", timeStyle: "short" })}
                    {p.processedBy && <span className="block text-taupe">by {p.processedBy.name ?? p.processedBy.email}</span>}
                    {p.reference && <span className="block text-taupe">ref {p.reference}</span>}
                    {p.failureReason && <span className="block text-danger">{p.failureReason}</span>}
                  </td>
                  <td className="p-3">
                    <StatusPill status={p.status} />
                  </td>
                  <td className="p-3">
                    {canPay && (p.status === "REQUESTED" || p.status === "PROCESSING") && (
                      <div className="flex flex-wrap justify-end gap-2">
                        {b2c && p.method === "MPESA" && p.status === "REQUESTED" && (
                          <ActionButton size="sm" variant="outline" action={processPayoutAction} input={{ id: p.id, action: "initiate" as const }} confirm={`Send ${formatMoney(p.amountCents)} via M-Pesa B2C?`}>
                            Send via M-Pesa
                          </ActionButton>
                        )}
                        <ActionButton size="sm" action={processPayoutAction} input={{ id: p.id, action: "paid" as const }} prompt={{ label: "Transaction reference (e.g. M-Pesa receipt or bank ref)", key: "reference" }} disabled={!verified}>
                          Mark paid
                        </ActionButton>
                        <ActionButton size="sm" variant="ghost" action={processPayoutAction} input={{ id: p.id, action: "failed" as const }} prompt={{ label: "Why did it fail? (shown to seller)", key: "reason" }}>
                          Failed
                        </ActionButton>
                      </div>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}
