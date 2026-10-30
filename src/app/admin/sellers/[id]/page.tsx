import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdminPage, hasPermissions } from "@/lib/auth/guards";
import { getSellerForAdmin } from "@/server/services/seller.service";
import { env } from "@/config/env";
import { PageHeader, StatCard } from "@/components/admin/shell";
import { ActionButton, FormDialog } from "@/components/admin/admin-ui";
import { Button } from "@/components/ui/button";
import { Badge, StatusPill } from "@/components/ui/misc";
import { decideSellerAction, reviewDocumentAction, setCommissionAction, setSellerFeaturedAction } from "@/features/marketplace/actions";
import { formatBytes, formatDate, formatMoney, maskPhone } from "@/lib/utils";

export const metadata = { title: "Seller" };

export default async function AdminSeller({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireAdminPage("sellers.view");
  const { id } = await params;
  const s = await getSellerForAdmin(id).catch(() => null);
  if (!s) notFound();
  const canManage = hasPermissions(user, ["sellers.manage"]);
  const canCommission = hasPermissions(user, ["sellers.commission"]);
  const p = s.profile;
  const w = s.wallet;
  const rate = s.commissionRateBps ?? env().DEFAULT_COMMISSION_BPS;

  const decide = (decision: "approve" | "reject" | "requestChanges" | "suspend" | "reactivate", label: string, variant: "primary" | "outline" | "danger" = "outline") =>
    decision === "approve" || decision === "reactivate" ? (
      <ActionButton size="sm" variant={variant} action={decideSellerAction} input={{ id: s.id, decision, notes: "" }} confirm={`${label} ${s.businessName}?`}>
        {label}
      </ActionButton>
    ) : (
      <ActionButton size="sm" variant={variant} action={decideSellerAction} input={{ id: s.id, decision, notes: "" }} prompt={{ label: "Reason (shown to the seller)", key: "notes" }}>
        {label}
      </ActionButton>
    );

  return (
    <>
      <PageHeader
        title={s.businessName}
        description={`${s.businessType.toLowerCase()} · ${[s.town, s.county?.name].filter(Boolean).join(", ")} · /designers/${s.slug}`}
        actions={
          <>
            <StatusPill status={s.status} />
            {canManage && s.status === "PENDING" && (
              <>
                {decide("approve", "Approve", "primary")}
                {decide("requestChanges", "Request changes")}
                {decide("reject", "Reject", "danger")}
              </>
            )}
            {canManage && s.status === "REJECTED" && decide("approve", "Approve")}
            {canManage && s.status === "APPROVED" && decide("suspend", "Suspend", "danger")}
            {canManage && s.status === "SUSPENDED" && decide("reactivate", "Reactivate", "primary")}
            {canManage && s.status === "APPROVED" && (
              <ActionButton size="sm" variant="ghost" action={setSellerFeaturedAction} input={{ id: s.id, isFeatured: !s.isFeatured }}>
                {s.isFeatured ? "Unfeature" : "Feature"}
              </ActionButton>
            )}
          </>
        }
      />
      {s.rejectionReason && s.status !== "APPROVED" && <p className="mb-6 border-l-2 border-danger/60 bg-danger/5 px-4 py-3 text-sm">Last note to seller: {s.rejectionReason}</p>}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <StatCard label="Products" value={String(s._count.products)} />
        <StatCard label="Orders" value={String(s._count.sellerOrders)} />
        <StatCard label="Pending earnings" value={formatMoney(Number(w?.pendingCents ?? 0n))} />
        <StatCard label="Available" value={formatMoney(Number(w?.availableCents ?? 0n))} />
        <StatCard label="Paid out" value={formatMoney(Number(w?.paidOutCents ?? 0n))} />
      </div>

      <div className="mt-8 grid gap-8 xl:grid-cols-2">
        <section className="space-y-2 border bg-surface p-6 text-sm">
          <h2 className="eyebrow mb-2">Business</h2>
          <p>
            <span className="text-taupe">Owner:</span> {s.owner.name} · {s.owner.email} · {s.owner.phone ? `${maskPhone(s.owner.phone)}${s.owner.phoneVerifiedAt ? " ✓" : ""}` : "no phone"}
          </p>
          {p && (
            <>
              <p>
                <span className="text-taupe">Contact:</span> {p.contactName} · {p.email} · {p.phone}
              </p>
              <p>
                <span className="text-taupe">KRA PIN:</span> {p.kraPin ?? "—"} · <span className="text-taupe">Reg. no.:</span> {p.registrationNumber ?? "—"}
              </p>
              <p>
                <span className="text-taupe">Sells:</span> {p.categories.join(", ") || "—"}
              </p>
              <p>
                <span className="text-taupe">Payouts:</span> {p.payoutMethod === "MPESA" ? `M-Pesa ${p.payoutMpesaPhone ? maskPhone(p.payoutMpesaPhone) : "not set"}` : `${p.payoutBankName} · ${p.payoutAccountName}`}
              </p>
              <p className="whitespace-pre-line pt-2 text-graphite">{p.description}</p>
              {(p.website || p.instagram) && (
                <p className="pt-2 text-xs">
                  {p.website} {p.instagram && `@${p.instagram}`}
                </p>
              )}
            </>
          )}
          <div className="flex items-center gap-3 border-t pt-4">
            <span>
              Commission: <strong className="font-medium">{(rate / 100).toFixed(1)}%</strong> {s.commissionRateBps == null && <span className="text-xs text-taupe">(platform default)</span>}
            </span>
            {canCommission && (
              <FormDialog
                title="Commission override"
                trigger={<Button size="sm" variant="outline">Change</Button>}
                fields={[{ name: "percent", label: "Commission %", type: "number", hint: "Leave empty to use the category/platform default. Changes apply to new orders only.", span: 2 }]}
                defaults={{ percent: s.commissionRateBps == null ? "" : s.commissionRateBps / 100 }}
                extra={{ id: s.id }}
                action={setCommissionAction}
              />
            )}
          </div>
          <p className="pt-2">
            <Link href={`/admin/products?seller=${s.id}`} className="text-xs underline underline-offset-4">
              View products
            </Link>
          </p>
        </section>

        <section className="border bg-surface p-6 text-sm">
          <h2 className="eyebrow mb-3">Verification documents</h2>
          <ul className="divide-y">
            {s.documents.length === 0 && <li className="py-3 text-taupe">No documents uploaded.</li>}
            {s.documents.map((d) => (
              <li key={d.id} className="flex flex-wrap items-center justify-between gap-2 py-3">
                <span>
                  <a href={`/api/admin/seller-documents/${d.id}`} target="_blank" rel="noopener" className="underline underline-offset-4">
                    {d.type.replace(/_/g, " ").toLowerCase()}
                  </a>
                  <span className="block text-xs text-taupe">
                    {d.fileName} · {formatBytes(d.size)} · {formatDate(d.createdAt, { dateStyle: "medium" })}
                  </span>
                </span>
                <span className="flex items-center gap-2">
                  <Badge tone={d.status === "ACCEPTED" ? "success" : d.status === "REJECTED" ? "danger" : "neutral"}>{d.status.toLowerCase()}</Badge>
                  {canManage && d.status === "PENDING" && (
                    <>
                      <ActionButton size="sm" variant="outline" action={reviewDocumentAction} input={{ id: d.id, status: "ACCEPTED" as const, note: "" }}>
                        Accept
                      </ActionButton>
                      <ActionButton size="sm" variant="ghost" action={reviewDocumentAction} input={{ id: d.id, status: "REJECTED" as const, note: "" }} prompt={{ label: "Why is this document rejected?", key: "note" }}>
                        Reject
                      </ActionButton>
                    </>
                  )}
                </span>
              </li>
            ))}
          </ul>
          <h2 className="eyebrow mb-3 mt-8">Decision history</h2>
          <ol className="space-y-2">
            {s.verifications.map((v) => (
              <li key={v.id} className="text-xs">
                <span className="text-taupe">{formatDate(v.createdAt, { dateStyle: "medium", timeStyle: "short" })}</span> — {v.decision.replace(/_/g, " ").toLowerCase()}
                {v.reviewer && ` by ${v.reviewer.name ?? v.reviewer.email}`}
                {v.notes && <span className="text-taupe"> · {v.notes}</span>}
              </li>
            ))}
          </ol>
        </section>
      </div>
    </>
  );
}
