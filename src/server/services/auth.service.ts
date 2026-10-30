import "server-only";
import { db } from "@/lib/db/prisma";
import { env } from "@/config/env";
import { AppError, badRequest, rateLimited } from "@/lib/errors";
import { burnPasswordCheck, hashPassword, verifyPassword } from "@/lib/security/password";
import { decrypt, encrypt, randomToken, sha256 } from "@/lib/security/crypto";
import { generateTotpSecret, verifyTotp } from "@/lib/security/totp";
import { limitBy } from "@/lib/security/rate-limit";
import type { RequestContext } from "@/lib/security/request";
import { enqueue } from "@/server/jobs/queue";
import { revokeUserSessions } from "@/lib/auth/session";
import { notify } from "./notification.service";
import { audit } from "./audit.service";
import type { TokenType } from "@/generated/prisma/client";

const MAX_FAILED_LOGINS = 5;
const LOCKOUT_MINUTES = 15;

async function issueToken(userId: string, type: TokenType, ttlMinutes: number) {
  const token = randomToken(32);
  // Invalidate any previous outstanding token of the same type.
  await db.verificationToken.updateMany({ where: { userId, type, usedAt: null }, data: { usedAt: new Date() } });
  await db.verificationToken.create({
    data: { userId, type, tokenHash: sha256(token), expiresAt: new Date(Date.now() + ttlMinutes * 60_000) },
  });
  return token;
}

async function consumeToken(token: string, type: TokenType) {
  const record = await db.verificationToken.findUnique({ where: { tokenHash: sha256(token) } });
  if (!record || record.type !== type || record.usedAt || record.expiresAt < new Date()) {
    throw badRequest("This link is invalid or has expired. Please request a new one.");
  }
  // Conditional update guarantees single use even under concurrent requests.
  const { count } = await db.verificationToken.updateMany({ where: { id: record.id, usedAt: null }, data: { usedAt: new Date() } });
  if (count === 0) throw badRequest("This link has already been used.");
  return record;
}

export async function registerCustomer(
  input: { name: string; email: string; password: string; marketingOptIn?: boolean },
  ctx: RequestContext,
) {
  const rl = await limitBy("register", ctx.ip);
  if (!rl.success) throw rateLimited();

  const existing = await db.user.findUnique({ where: { email: input.email } });
  if (existing) throw new AppError("CONFLICT", "An account with this email already exists", { email: ["Already registered — try signing in"] });

  const passwordHash = await hashPassword(input.password);
  const customerRole = await db.role.findUniqueOrThrow({ where: { key: "CUSTOMER" } });

  const user = await db.$transaction(async (tx) => {
    const created = await tx.user.create({
      data: {
        email: input.email,
        name: input.name,
        passwordHash,
        profile: { create: { notifyPromotions: !!input.marketingOptIn } },
        wishlist: { create: {} },
        roles: { create: { roleId: customerRole.id } },
      },
    });
    if (input.marketingOptIn) {
      await tx.newsletterSubscriber.upsert({
        where: { email: input.email },
        update: { status: "SUBSCRIBED" },
        create: { email: input.email, source: "registration", unsubscribeToken: randomToken(24) },
      });
    }
    return created;
  });

  const token = await issueToken(user.id, "EMAIL_VERIFICATION", 60 * 24);
  await enqueue("email.verify", { userId: user.id, token });
  return user;
}

export async function resendVerification(userId: string) {
  const user = await db.user.findUniqueOrThrow({ where: { id: userId } });
  if (user.emailVerifiedAt) return;
  const rl = await limitBy("passwordReset", `verify:${userId}`);
  if (!rl.success) throw rateLimited();
  const token = await issueToken(user.id, "EMAIL_VERIFICATION", 60 * 24);
  await enqueue("email.verify", { userId: user.id, token });
}

export async function verifyEmail(token: string) {
  const record = await consumeToken(token, "EMAIL_VERIFICATION");
  await db.user.update({ where: { id: record.userId }, data: { emailVerifiedAt: new Date() } });
  return record.userId;
}

/**
 * Verifies credentials with rate limiting, account lockout, timing equalisation and
 * suspicious sign-in detection. Never reveals whether the email exists.
 */
export async function authenticate(email: string, password: string, ctx: RequestContext) {
  const [byIp, byEmail] = await Promise.all([limitBy("login", ctx.ip), limitBy("loginEmail", email)]);
  if (!byIp.success || !byEmail.success) throw rateLimited("Too many sign-in attempts. Please wait a few minutes.");

  const invalid = new AppError("UNAUTHENTICATED", "Incorrect email or password");
  const user = await db.user.findUnique({ where: { email } });

  const record = (success: boolean, reason?: string) =>
    db.loginAttempt.create({ data: { email, ip: ctx.ip, userAgent: ctx.userAgent, success, reason } });

  if (!user || !user.passwordHash || user.deletedAt) {
    await burnPasswordCheck(password);
    await record(false, user ? "no_password" : "unknown_email");
    throw invalid;
  }
  if (user.lockedUntil && user.lockedUntil > new Date()) {
    await record(false, "locked");
    throw new AppError("RATE_LIMITED", "This account is temporarily locked after repeated failed attempts. Try again later or reset your password.");
  }
  const ok = await verifyPassword(user.passwordHash, password);
  if (!ok) {
    const failed = user.failedLoginCount + 1;
    await db.user.update({
      where: { id: user.id },
      data: {
        failedLoginCount: failed,
        lockedUntil: failed >= MAX_FAILED_LOGINS ? new Date(Date.now() + LOCKOUT_MINUTES * 60_000) : null,
      },
    });
    await record(false, "bad_password");
    if (failed >= MAX_FAILED_LOGINS) await audit(user.id, "auth.lockout", "User", user.id, { ip: ctx.ip });
    throw invalid;
  }
  if (user.status === "SUSPENDED") {
    await record(false, "suspended");
    throw new AppError("FORBIDDEN", "This account has been suspended. Please contact support.");
  }

  await detectSuspiciousLogin(user.id, user.email, ctx);
  await db.user.update({
    where: { id: user.id },
    data: { failedLoginCount: 0, lockedUntil: null, lastLoginAt: new Date(), lastLoginIp: ctx.ip },
  });
  await record(true);
  return user;
}

/** Flags a sign-in from an IP/device combination not seen in the last 90 days of successful logins. */
export async function detectSuspiciousLogin(userId: string, email: string, ctx: RequestContext) {
  const since = new Date(Date.now() - 90 * 86400_000);
  const previous = await db.loginAttempt.findMany({
    where: { email, success: true, createdAt: { gte: since } },
    select: { ip: true, userAgent: true },
    take: 50,
    orderBy: { createdAt: "desc" },
  });
  if (previous.length === 0) return false; // first sign-in
  const known = previous.some((p) => p.ip === ctx.ip || p.userAgent === ctx.userAgent);
  if (known) return false;
  await notify(userId, "SYSTEM", "New sign-in to your account", `We noticed a sign-in from a new device or location (${ctx.ip}). If this wasn't you, reset your password.`, "/account/security");
  await enqueue("email.newSignIn", { userId, ip: ctx.ip, userAgent: ctx.userAgent });
  await audit(userId, "auth.suspicious_login", "User", userId, { ip: ctx.ip, userAgent: ctx.userAgent });
  return true;
}

export async function requestPasswordReset(email: string, ctx: RequestContext) {
  const [byIp, byEmail] = await Promise.all([limitBy("passwordReset", ctx.ip), limitBy("passwordReset", email)]);
  if (!byIp.success || !byEmail.success) throw rateLimited();
  const user = await db.user.findUnique({ where: { email } });
  // Same response whether or not the account exists.
  if (!user || user.deletedAt || user.status === "SUSPENDED") return;
  const token = await issueToken(user.id, "PASSWORD_RESET", 60);
  await enqueue("email.passwordReset", { userId: user.id, token });
}

export async function resetPassword(token: string, password: string) {
  const record = await consumeToken(token, "PASSWORD_RESET");
  await db.user.update({
    where: { id: record.userId },
    data: { passwordHash: await hashPassword(password), failedLoginCount: 0, lockedUntil: null, emailVerifiedAt: new Date() },
  });
  await revokeUserSessions(record.userId);
  await audit(record.userId, "auth.password_reset", "User", record.userId);
}

export async function changePassword(userId: string, sessionId: string, current: string, next: string) {
  const user = await db.user.findUniqueOrThrow({ where: { id: userId } });
  if (user.passwordHash && !(await verifyPassword(user.passwordHash, current))) {
    throw new AppError("VALIDATION", "Current password is incorrect", { currentPassword: ["Current password is incorrect"] });
  }
  await db.user.update({ where: { id: userId }, data: { passwordHash: await hashPassword(next) } });
  await revokeUserSessions(userId, sessionId);
  await audit(userId, "auth.password_changed", "User", userId);
}

// ── Google OAuth ─────────────────────────────────────────────

export async function findOrCreateOAuthUser(profile: { provider: string; providerAccountId: string; email: string; emailVerified: boolean; name?: string; picture?: string }) {
  const linked = await db.account.findUnique({
    where: { provider_providerAccountId: { provider: profile.provider, providerAccountId: profile.providerAccountId } },
    include: { user: true },
  });
  if (linked) return linked.user;

  const existing = await db.user.findUnique({ where: { email: profile.email } });
  if (existing) {
    // Only link to an existing account when the provider has verified the email address,
    // otherwise an attacker could pre-register the victim's address with the provider.
    if (!profile.emailVerified) throw badRequest("Your Google email address is not verified.");
    await db.account.create({ data: { userId: existing.id, provider: profile.provider, providerAccountId: profile.providerAccountId } });
    if (!existing.emailVerifiedAt) await db.user.update({ where: { id: existing.id }, data: { emailVerifiedAt: new Date() } });
    return existing;
  }

  const customerRole = await db.role.findUniqueOrThrow({ where: { key: "CUSTOMER" } });
  return db.user.create({
    data: {
      email: profile.email,
      name: profile.name,
      image: profile.picture,
      emailVerifiedAt: profile.emailVerified ? new Date() : null,
      accounts: { create: { provider: profile.provider, providerAccountId: profile.providerAccountId } },
      profile: { create: {} },
      wishlist: { create: {} },
      roles: { create: { roleId: customerRole.id } },
    },
  });
}

// ── MFA (TOTP) ───────────────────────────────────────────────

export async function beginMfaEnrollment(userId: string) {
  const user = await db.user.findUniqueOrThrow({ where: { id: userId } });
  if (user.mfaEnabled) throw badRequest("MFA is already enabled");
  const secret = generateTotpSecret();
  await db.user.update({ where: { id: userId }, data: { mfaSecret: encrypt(secret, env().ENCRYPTION_KEY) } });
  return secret;
}

export async function confirmMfaEnrollment(userId: string, sessionId: string, code: string) {
  const user = await db.user.findUniqueOrThrow({ where: { id: userId } });
  if (!user.mfaSecret) throw badRequest("Start MFA setup first");
  if (!verifyTotp(decrypt(user.mfaSecret, env().ENCRYPTION_KEY), code)) {
    throw new AppError("VALIDATION", "That code didn't match", { code: ["That code didn't match — check your device clock"] });
  }
  await db.user.update({ where: { id: userId }, data: { mfaEnabled: true } });
  await db.session.update({ where: { id: sessionId }, data: { mfaVerified: true } });
  await revokeUserSessions(userId, sessionId);
  await audit(userId, "auth.mfa_enabled", "User", userId);
}

export async function verifyMfaChallenge(userId: string, sessionId: string, code: string, ctx: RequestContext) {
  const rl = await limitBy("mfa", `${userId}:${ctx.ip}`);
  if (!rl.success) throw rateLimited();
  const user = await db.user.findUniqueOrThrow({ where: { id: userId } });
  if (!user.mfaEnabled || !user.mfaSecret) throw badRequest("MFA is not enabled");
  if (!verifyTotp(decrypt(user.mfaSecret, env().ENCRYPTION_KEY), code)) {
    await audit(userId, "auth.mfa_failed", "User", userId, { ip: ctx.ip });
    throw new AppError("VALIDATION", "Invalid code", { code: ["Invalid code"] });
  }
  await db.session.update({ where: { id: sessionId }, data: { mfaVerified: true } });
}

// ── Staff invitations ────────────────────────────────────────

export async function acceptInvitation(token: string, name: string, password: string) {
  const invite = await db.adminInvitation.findUnique({ where: { tokenHash: sha256(token) } });
  if (!invite || invite.acceptedAt || invite.revokedAt || invite.expiresAt < new Date()) {
    throw badRequest("This invitation is invalid or has expired.");
  }
  const passwordHash = await hashPassword(password);
  const user = await db.$transaction(async (tx) => {
    const claimed = await tx.adminInvitation.updateMany({ where: { id: invite.id, acceptedAt: null }, data: { acceptedAt: new Date() } });
    if (claimed.count === 0) throw badRequest("This invitation has already been used.");
    const existing = await tx.user.findUnique({ where: { email: invite.email } });
    const u = existing
      ? await tx.user.update({ where: { id: existing.id }, data: { isStaff: true, passwordHash, name, emailVerifiedAt: new Date(), status: "ACTIVE" } })
      : await tx.user.create({ data: { email: invite.email, name, passwordHash, isStaff: true, emailVerifiedAt: new Date(), profile: { create: {} }, wishlist: { create: {} } } });
    for (const roleId of invite.roleIds) {
      await tx.userRole.upsert({
        where: { userId_roleId: { userId: u.id, roleId } },
        update: {},
        create: { userId: u.id, roleId, assignedById: invite.invitedById },
      });
    }
    return u;
  });
  await audit(user.id, "staff.invitation_accepted", "User", user.id, { invitationId: invite.id });
  return user;
}
