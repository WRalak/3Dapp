import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { BadgeCheck, Smartphone, Truck, Users } from "lucide-react";
import { getSellerForCurrentUser } from "@/lib/auth/seller-guard";
import { listCounties } from "@/server/services/delivery.service";
import { db } from "@/lib/db/prisma";
import { env } from "@/config/env";
import { Button } from "@/components/ui/button";
import { SellerApplicationForm } from "./application-form";

export const metadata: Metadata = { title: "Sell on 3Dapp", description: "Open your store on Kenya's 3D fashion marketplace. Reach customers across all 47 counties and get paid to M-Pesa." };
export const dynamic = "force-dynamic";

export default async function SellPage() {
  const ctx = await getSellerForCurrentUser();
  if (ctx?.seller) redirect(ctx.seller.status === "APPROVED" ? "/seller" : "/sell/status");
  const [counties, categories] = await Promise.all([listCounties(), db.category.findMany({ where: { isActive: true, parentId: null }, orderBy: { sortOrder: "asc" }, select: { slug: true, name: true } })]);
  const commission = env().DEFAULT_COMMISSION_BPS / 100;

  const perks = [
    { icon: Users, title: "Reach all 47 counties", body: "Your store page, follows, and a place on the 3D rail beside Kenya's best designers." },
    { icon: Smartphone, title: "Paid to M-Pesa", body: `Customers pay 3Dapp; you receive your earnings (less ${commission}% commission) after delivery.` },
    { icon: Truck, title: "Your delivery, your way", body: "Set your own zones, prices and times — same-day in your town, courier upcountry, or pickup." },
    { icon: BadgeCheck, title: "Trusted marketplace", body: "Every seller and listing is reviewed, so customers buy with confidence." },
  ];

  return (
    <div className="container-luxe pt-10 md:pt-16">
      <div className="grid gap-12 lg:grid-cols-12">
        <div className="lg:col-span-5">
          <p className="eyebrow text-taupe">Sell on 3Dapp</p>
          <h1 className="mt-3 text-headline font-medium">Open your store</h1>
          <p className="mt-4 text-graphite">Join independent Kenyan designers, tailors and boutiques selling to customers nationwide. Applications are reviewed within 2 business days.</p>
          <ul className="mt-10 space-y-6">
            {perks.map((p) => (
              <li key={p.title} className="flex gap-4">
                <p.icon className="mt-0.5 size-5 shrink-0" strokeWidth={1.5} />
                <div>
                  <p className="font-medium">{p.title}</p>
                  <p className="text-sm text-graphite">{p.body}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>
        <div className="border bg-surface p-6 md:p-10 lg:col-span-7">
          {ctx?.user ? (
            <SellerApplicationForm
              counties={counties.map((c) => ({ id: c.id, name: c.name }))}
              categories={categories}
              defaults={{ contactName: ctx.user.name ?? "", email: ctx.user.email }}
            />
          ) : (
            <div className="text-center">
              <h2 className="text-2xl font-medium">Create an account to apply</h2>
              <p className="mt-2 text-sm text-graphite">Your seller account is linked to your 3Dapp login.</p>
              <div className="mt-6 flex justify-center gap-3">
                <Button asChild>
                  <Link href="/register?next=/sell">Create account</Link>
                </Button>
                <Button asChild variant="outline">
                  <Link href="/login?next=/sell">Sign in</Link>
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
