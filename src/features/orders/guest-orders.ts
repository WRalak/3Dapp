import "server-only";
import { cookies } from "next/headers";
import { env } from "@/config/env";
import { signPayload, verifyPayload } from "@/lib/security/crypto";

const COOKIE = "atelier_guest_orders";

/** Order numbers placed by this browser without an account (HMAC-signed, HttpOnly). */
export async function readGuestOrders(): Promise<string[]> {
  const raw = (await cookies()).get(COOKIE)?.value;
  const data = raw ? verifyPayload<{ n: string[] }>(raw, env().AUTH_SECRET) : null;
  return data?.n ?? [];
}

export async function rememberGuestOrder(number: string) {
  const current = await readGuestOrders();
  const next = [number, ...current.filter((n) => n !== number)].slice(0, 10);
  (await cookies()).set(COOKIE, signPayload({ n: next }, env().AUTH_SECRET, 60 * 60 * 24 * 30), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
}
