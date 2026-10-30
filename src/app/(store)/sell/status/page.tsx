import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getSellerForCurrentUser } from "@/lib/auth/seller-guard";
import { db } from "@/lib/db/prisma";
import { listCounties } from "@/server/services/delivery.service";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/misc";
import { formatDate } from "@/lib/utils";
import { SellerDocuments } from "./documents";
import { SellerApplicationForm } from "../application-form";

export const metadata: Metadata = { title: "Seller application", robots: { index: false } };
export const dynamic = "force-dynamic";

const STATUS: Record<string, { tone: "neutral" | "success" | "danger" | "warning"; title: string; body: string }> = {
  PENDING: { tone: "warning", title: "Application under review", body: "We review applications within 2 business days. Uploading your ID and KRA PIN speeds things up." },
  APPROVED: { tone: "success", title: "You're approved", body: "Your store is live. Head to your seller dashboard to add products and delivery options." },
  REJECTED: { tone: "danger", title: "Changes needed", body: "Please review the note below, update your details and resubmit." },
  SUSPENDED: { tone: "danger", title: "Store suspended", body: "Your products are hidden while we review your account. Contact seller support for help." },
};

export default async function SellerStatusPage() {
  const ctx = await getSellerForCurrentUser();
  if (!ctx) redirect("/login?next=/sell/status");
  if (!ctx.seller) redirect("/sell");
  const s = ctx.seller;
  const [documents, history, counties, categories] = await Promise.all([
    db.sellerDocument.findMany({ where: { sellerId: s.id }, orderBy: { createdAt: "desc" }, select: { id: true, type: true, fileName: true, status: true, note: true } }),
    db.sellerVerification.findMany({ where: { sellerId: s.id }, orderBy: { createdAt: "desc" }, take: 10 }),
    s.status === "REJECTED" ? listCounties() : Promise.resolve([]),
    s.status === "REJECTED" ? db.category.findMany({ where: { isActive: true, parentId: null }, select: { slug: true, name: true } }) : Promise.resolve([]),
  ]);
  const info = STATUS[s.status]!;

  return (
    <div className="container-luxe max-w-3xl pt-10 md:pt-16">
      <p className="eyebrow text-taupe">{s.businessName}</p>
      <h1 className="mt-3 flex flex-wrap items-center gap-3 text-headline font-medium">
        {info.title} <Badge tone={info.tone}>{s.status.toLowerCase()}</Badge>
      </h1>
      <p className="mt-4 text-graphite">{info.body}</p>
      {s.rejectionReason && s.status !== "APPROVED" && <p className="mt-4 border-l-2 border-danger/60 bg-danger/5 px-4 py-3 text-sm">{s.rejectionReason}</p>}
      {s.status === "APPROVED" && (
        <Button asChild className="mt-6">
          <Link href="/seller">Go to seller dashboard</Link>
        </Button>
      )}

      <section className="mt-12">
        <h2 className="text-xl font-medium">Verification documents</h2>
        <p className="mb-4 mt-1 text-sm text-taupe">National ID and KRA PIN are required before your first payout.</p>
        <SellerDocuments documents={documents} editable={s.status !== "SUSPENDED"} />
      </section>

      {s.status === "REJECTED" && s.profile && (
        <section className="mt-12 border bg-surface p-6">
          <h2 className="mb-6 text-xl font-medium">Update and resubmit</h2>
          <SellerApplicationForm
            counties={counties.map((c) => ({ id: c.id, name: c.name }))}
            categories={categories}
            defaults={{
              businessName: s.businessName,
              businessType: s.businessType,
              contactName: s.profile.contactName,
              email: s.profile.email,
              phone: s.profile.phone,
              countyId: s.countyId ?? "",
              town: s.town ?? "",
              description: s.profile.description,
              categories: s.profile.categories,
              website: s.profile.website ?? "",
              instagram: s.profile.instagram ?? "",
              registrationNumber: s.profile.registrationNumber ?? "",
              kraPin: s.profile.kraPin ?? "",
            }}
          />
        </section>
      )}

      {history.length > 0 && (
        <section className="mt-12">
          <h2 className="text-xl font-medium">History</h2>
          <ul className="mt-4 space-y-2 text-sm">
            {history.map((h) => (
              <li key={h.id} className="flex gap-3">
                <span className="w-36 shrink-0 text-taupe">{formatDate(h.createdAt, { dateStyle: "medium" })}</span>
                <span>
                  {h.decision.replace(/_/g, " ").toLowerCase()}
                  {h.notes && <span className="text-taupe"> — {h.notes}</span>}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
