import { requireAdminPage } from "@/lib/auth/guards";
import { db } from "@/lib/db/prisma";
import { SHIPPING_PROVIDERS } from "@/features/delivery/providers";
import { PageHeader } from "@/components/admin/shell";

export const metadata = { title: "Counties & delivery" };

/** Read-only coverage map: which counties have sellers delivering, and how many. */
export default async function DeliveryCoverage() {
  await requireAdminPage("delivery.manage");
  const counties = await db.county.findMany({
    orderBy: { code: "asc" },
    include: { _count: { select: { sellers: { where: { status: "APPROVED" } }, addresses: true } }, zones: { where: { zone: { isActive: true, seller: { status: "APPROVED" } } }, select: { zone: { select: { sellerId: true } } } } },
  });
  return (
    <>
      <PageHeader title="Counties & delivery" description={`Delivery is configured per seller. Shipping providers available: ${SHIPPING_PROVIDERS.map((p) => p.label).join(", ")}.`} />
      <div className="overflow-x-auto border bg-surface">
        <table className="w-full text-left text-sm">
          <thead className="border-b text-xs text-taupe">
            <tr>
              <th className="p-3 font-normal">Code</th>
              <th className="p-3 font-normal">County</th>
              <th className="p-3 font-normal">Sellers based here</th>
              <th className="p-3 font-normal">Sellers delivering</th>
              <th className="p-3 font-normal">Saved addresses</th>
            </tr>
          </thead>
          <tbody>
            {counties.map((c) => {
              const delivering = new Set(c.zones.map((z) => z.zone.sellerId)).size;
              return (
                <tr key={c.id} className="border-b last:border-0">
                  <td className="p-3 tabular-nums text-taupe">{String(c.code).padStart(3, "0")}</td>
                  <td className="p-3">{c.name}</td>
                  <td className="p-3 tabular-nums">{c._count.sellers}</td>
                  <td className={delivering === 0 ? "p-3 tabular-nums text-warning" : "p-3 tabular-nums"}>{delivering}</td>
                  <td className="p-3 tabular-nums">{c._count.addresses}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}
