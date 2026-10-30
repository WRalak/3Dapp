import Link from "next/link";
import { requireAdminPage } from "@/lib/auth/guards";
import { db } from "@/lib/db/prisma";
import { PageHeader } from "@/components/admin/shell";
import { FormDialog } from "@/components/admin/admin-ui";
import { Button } from "@/components/ui/button";
import { Badge, EmptyState } from "@/components/ui/misc";
import { resolveReportAction } from "@/features/marketplace/actions";
import { formatDate } from "@/lib/utils";

export const metadata = { title: "Reports" };

export default async function Reports({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  await requireAdminPage("reports.manage");
  const { status = "OPEN" } = await searchParams;
  const reports = await db.productReport.findMany({
    where: { status: status === "OPEN" ? "OPEN" : { in: ["RESOLVED", "DISMISSED"] } },
    orderBy: { createdAt: status === "OPEN" ? "asc" : "desc" },
    take: 100,
    include: { product: { select: { id: true, name: true, slug: true, seller: { select: { id: true, businessName: true } } } }, reporter: { select: { email: true } } },
  });
  return (
    <>
      <PageHeader title="Reports" description="Customer reports about listings (counterfeits, misleading photos, copied designs)." />
      <nav className="mb-4 flex gap-1 border-b text-sm">
        {[
          ["OPEN", "Open"],
          ["CLOSED", "Closed"],
        ].map(([k, l]) => (
          <Link key={k} href={`/admin/reports?status=${k}`} className={k === status ? "border-b-2 border-ink px-3 py-2" : "px-3 py-2 text-taupe"}>
            {l}
          </Link>
        ))}
      </nav>
      {reports.length === 0 ? (
        <EmptyState title="No reports" />
      ) : (
        <ul className="divide-y border bg-surface text-sm">
          {reports.map((r) => (
            <li key={r.id} className="flex flex-wrap items-start justify-between gap-4 p-4">
              <div className="min-w-0">
                <p>
                  <Badge tone="warning">{r.reason.replace(/_/g, " ").toLowerCase()}</Badge>{" "}
                  <Link href={`/admin/products/${r.product.id}`} className="font-medium underline-offset-4 hover:underline">
                    {r.product.name}
                  </Link>{" "}
                  <span className="text-taupe">by {r.product.seller.businessName}</span>
                </p>
                {r.details && <p className="mt-1 text-graphite">{r.details}</p>}
                <p className="mt-1 text-xs text-taupe">
                  {r.reporter.email} · {formatDate(r.createdAt, { dateStyle: "medium" })}
                  {r.resolution && ` · ${r.status.toLowerCase()}: ${r.resolution}`}
                </p>
              </div>
              {r.status === "OPEN" && (
                <FormDialog
                  title="Close report"
                  trigger={<Button size="sm" variant="outline">Resolve</Button>}
                  fields={[
                    { name: "status", label: "Outcome", type: "select", options: [{ value: "RESOLVED", label: "Valid — action taken" }, { value: "DISMISSED", label: "Dismissed" }] },
                    { name: "resolution", label: "Notes", type: "textarea" },
                    { name: "hideProduct", label: "Remove the listing from the storefront", type: "checkbox" },
                  ]}
                  defaults={{ status: "RESOLVED", resolution: "", hideProduct: false }}
                  extra={{ id: r.id }}
                  action={resolveReportAction}
                />
              )}
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
