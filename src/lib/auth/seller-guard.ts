import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { db } from "@/lib/db/prisma";
import { forbidden, unauthenticated } from "@/lib/errors";
import { getCurrentUser, type AuthUser } from "./guards";

/**
 * Seller isolation: the seller is ALWAYS resolved from the signed-in user's session — never
 * from a request parameter — and every seller-scoped query filters by `seller.id`.
 */
export const getSellerForCurrentUser = cache(async () => {
  const user = await getCurrentUser();
  if (!user) return null;
  const seller = await db.seller.findUnique({ where: { ownerId: user.id }, include: { profile: true, county: true } });
  return seller && !seller.deletedAt ? { user, seller } : { user, seller: null };
});

export type SellerContext = { user: AuthUser; seller: NonNullable<Awaited<ReturnType<typeof getSellerForCurrentUser>>>["seller"] & object };

/** For Server Actions / Route Handlers: an APPROVED seller or a typed error. */
export async function requireSeller(): Promise<SellerContext> {
  const ctx = await getSellerForCurrentUser();
  if (!ctx) throw unauthenticated();
  if (!ctx.seller) throw forbidden("You don't have a seller account");
  if (ctx.seller.status !== "APPROVED") throw forbidden("Your seller account is not active");
  return ctx as SellerContext;
}

/** Any seller record regardless of status (application & document management). */
export async function requireSellerApplicant(): Promise<SellerContext> {
  const ctx = await getSellerForCurrentUser();
  if (!ctx) throw unauthenticated();
  if (!ctx.seller) throw forbidden("You don't have a seller application");
  return ctx as SellerContext;
}

/** For seller-portal pages. */
export async function requireSellerPage(next = "/seller"): Promise<SellerContext> {
  const ctx = await getSellerForCurrentUser();
  if (!ctx) redirect(`/login?next=${encodeURIComponent(next)}`);
  if (!ctx.seller) redirect("/sell");
  if (ctx.seller.status !== "APPROVED") redirect("/sell/status");
  return ctx as SellerContext;
}
