import "server-only";
import { cookies } from "next/headers";
import { cache } from "react";
import { db } from "@/lib/db/prisma";
import { env } from "@/config/env";
import { randomToken, sha256 } from "@/lib/security/crypto";

/**
 * Opaque, database-backed sessions. The browser holds a random 256-bit token in an
 * HttpOnly, Secure, SameSite=Lax cookie; the database stores only its SHA-256 hash, so a
 * database leak cannot be replayed and any session can be revoked server-side instantly.
 */
export const SESSION_COOKIE = process.env.NODE_ENV === "production" ? "__Host-atelier_session" : "atelier_session";
const TOUCH_INTERVAL_MS = 5 * 60 * 1000;

function ttlMs(isStaff: boolean) {
  const e = env();
  return isStaff ? e.ADMIN_SESSION_TTL_HOURS * 3600_000 : e.SESSION_TTL_DAYS * 86400_000;
}

export async function createSession(
  user: { id: string; isStaff: boolean },
  ctx: { ip?: string; userAgent?: string; mfaVerified?: boolean },
) {
  const token = randomToken(32);
  const expiresAt = new Date(Date.now() + ttlMs(user.isStaff));
  const session = await db.session.create({
    data: {
      tokenHash: sha256(token),
      userId: user.id,
      expiresAt,
      mfaVerified: ctx.mfaVerified ?? false,
      ip: ctx.ip,
      userAgent: ctx.userAgent,
    },
  });
  const jar = await cookies();
  jar.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires: expiresAt,
  });
  return session;
}

export async function destroyCurrentSession() {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token) {
    await db.session.updateMany({ where: { tokenHash: sha256(token), revokedAt: null }, data: { revokedAt: new Date() } });
  }
  jar.delete(SESSION_COOKIE);
}

export async function revokeUserSessions(userId: string, exceptSessionId?: string) {
  await db.session.updateMany({
    where: { userId, revokedAt: null, ...(exceptSessionId ? { id: { not: exceptSessionId } } : {}) },
    data: { revokedAt: new Date() },
  });
}

export async function readSessionToken() {
  const jar = await cookies();
  return jar.get(SESSION_COOKIE)?.value ?? null;
}

/** Resolves the session for the current request (memoised per request). */
export const getSessionRecord = cache(async () => {
  const token = await readSessionToken();
  if (!token) return null;
  const session = await db.session.findUnique({
    where: { tokenHash: sha256(token) },
    include: {
      user: {
        include: {
          roles: { include: { role: { include: { permissions: { include: { permission: true } } } } } },
          permissions: { include: { permission: true } },
        },
      },
    },
  });
  if (!session || session.revokedAt || session.expiresAt < new Date()) return null;
  if (session.user.status !== "ACTIVE" || session.user.deletedAt) return null;

  if (Date.now() - session.lastSeenAt.getTime() > TOUCH_INTERVAL_MS) {
    await db.session.update({ where: { id: session.id }, data: { lastSeenAt: new Date() } }).catch(() => undefined);
  }
  return session;
});
