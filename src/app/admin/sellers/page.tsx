import Link from "next/link";
import { requireAdminPage } from "@/lib/auth/guards";
import { listSellers } from "@/server/services/seller.service";
import { PageHeader } from "@/components/admin/shell";
import { Pagination, StatusPill } from "@/components/ui/misc";
import { formatDate, formatMoney } from "@/lib/utils";
import type { SellerStatus } from "@/generated/prisma/client";

export const metadata = { title: "Sellers" };

const TABS: { key: SellerStatus | ""; label: string }[] = [
  { key: "PENDING", label: "Applications" },
  { key: "APPROVED", label: "Active" },
  { key: "SUSPENDED", label: "Suspended" },
  { key: "REJECTED", label: "Rejected" },
  { key: "", label: "All" },
];

export default async function AdminSellers({ searchParams }: { searchParams: Promise<{ status?: string; q?: string; page?: string }> }) {
  await requireAdminPage("sellers.view");
  const sp = await searchParams;
  const status = (sp.status ?? "PENDING") as SellerStatus | "";
  const { rows, total, page, pages } = await listSellers({ status: status || undefined, q: sp.q, page: Number(sp.page) || 1 });
  return (
    <>
      <PageHeader title="Sellers" description={`${total} seller(s)`} />
      <nav className="mb-4 flex flex-wrap gap-1 border-b text-sm" aria-label="Seller status">
        {TABS.map((t) => (
          <Link key={t.label} href={`/admin/sellers?status=${t.key}`} aria-current={t.key === status ? "page" : undefined} className={t.key === status ? "border-b-2 border-ink px-3 py-2" : "px-3 py-2 text-taupe hover:text-ink"}>
            {t.label}
          </Link>
        ))}
        <form className="ml-auto pb-1">
          <input type="hidden" name="status" value={status} />
          <input name="q" defaultValue={sp.q} placeholder="Store or owner email" className="h-8 border bg-surface px-2 text-xs" />
        </form>
      </nav>
      <div className="overflow-x-auto border bg-surface">
        <table className="w-full text-left text-sm">
          <thead className="border-b text-xs text-taupe">
            <tr>
              <th className="p-3 font-normal">Store</th>
              <th className="p-3 font-normal">Location</th>
              <th className="p-3 font-normal">Products</th>
              <th className="p-3 font-normal">Orders</th>
              <th className="p-3 font-normal">Docs</th>
              <th className="p-3 font-normal">Available</th>
              <th className="p-3 font-normal">Status</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={7} className="p-6 text-center text-taupe">
                  None.
                </td>
              </tr>
            )}
            {rows.map((s) => (
              <tr key={s.id} className="border-b last:border-0">
                <td className="p-3">
                  <Link href={`/admin/sellers/${s.id}`} className="font-medium underline-offset-4 hover:underline">
                    {s.businessName}
                  </Link>
                  <span className="block text-xs text-taupe">
                    {s.owner.email} · applied {formatDate(s.createdAt, { dateStyle: "medium" })}
                  </span>
                </td>
                <td className="p-3">{[s.town, s.county?.name].filter(Boolean).join(", ")}</td>
                <td className="p-3 tabular-nums">{s._count.products}</td>
                <td className="p-3 tabular-nums">{s._count.sellerOrders}</td>
                <td className="p-3 tabular-nums">{s._count.documents}</td>
                <td className="p-3 tabular-nums">{formatMoney(Number(s.wallet?.availableCents ?? 0n))}</td>
                <td className="p-3">
                  <StatusPill status={s.status} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Pagination page={page} pageCount={pages} hrefFor={(n) => `/admin/sellers?status=${status}&page=${n}${sp.q ? `&q=${encodeURIComponent(sp.q)}` : ""}`} />
    </>
  );
}
