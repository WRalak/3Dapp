import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { jar, resetBrowser } from "../support/request-mock";
import { createUser, ensureRoles, testDb, uid } from "../support/factories";
import { authenticate, registerCustomer, requestPasswordReset, resetPassword } from "@/server/services/auth.service";
import { createSession, SESSION_COOKIE, destroyCurrentSession } from "@/lib/auth/session";
import { getSessionRecord } from "@/lib/auth/session";
import { sha256 } from "@/lib/security/crypto";

const ctx = (ip = "198.51.100.1") => ({ ip, userAgent: "vitest-agent" });

beforeAll(ensureRoles);
beforeEach(() => resetBrowser());

describe("registration", () => {
  it("creates a customer with profile, wishlist, CUSTOMER role and a verification email job", async () => {
    const email = `${uid("reg")}@example.com`;
    const user = await registerCustomer({ name: "Ada", email, password: "Correct-Horse-9" }, ctx(`10.0.0.${Math.floor(Math.random() * 200)}`));
    const full = await testDb.user.findUniqueOrThrow({ where: { id: user.id }, include: { roles: { include: { role: true } }, profile: true, wishlist: true } });
    expect(full.passwordHash).toMatch(/^\$argon2id\$/);
    expect(full.roles.map((r) => r.role.key)).toEqual(["CUSTOMER"]);
    expect(full.isStaff).toBe(false);
    expect(full.profile && full.wishlist).toBeTruthy();
    expect(await testDb.job.count({ where: { type: "email.verify", payload: { path: ["userId"], equals: user.id } } })).toBe(1);
  });

  it("rejects duplicate emails", async () => {
    const u = await createUser();
    await expect(registerCustomer({ name: "X", email: u.email, password: "Correct-Horse-9" }, ctx("10.1.1.1"))).rejects.toMatchObject({ code: "CONFLICT" });
  });
});

describe("authentication", () => {
  it("accepts correct credentials and records the attempt", async () => {
    const u = await createUser();
    const user = await authenticate(u.email, "Correct-Horse-9", ctx("10.2.0.1"));
    expect(user.id).toBe(u.id);
    expect(await testDb.loginAttempt.count({ where: { email: u.email, success: true } })).toBe(1);
  });

  it("gives the same error for unknown emails and wrong passwords", async () => {
    const u = await createUser();
    const a = await authenticate(u.email, "nope", ctx("10.2.0.2")).catch((e) => e.message);
    const b = await authenticate(`${uid()}@nowhere.example`, "nope", ctx("10.2.0.3")).catch((e) => e.message);
    expect(a).toBe(b);
  });

  it("locks the account after repeated failures", async () => {
    const u = await createUser();
    for (let i = 0; i < 5; i++) await authenticate(u.email, "wrong", ctx(`10.3.0.${i}`)).catch(() => undefined);
    const locked = await testDb.user.findUniqueOrThrow({ where: { id: u.id } });
    expect(locked.lockedUntil!.getTime()).toBeGreaterThan(Date.now());
    // Even the right password is refused while locked.
    await expect(authenticate(u.email, "Correct-Horse-9", ctx("10.3.1.1"))).rejects.toBeTruthy();
  });

  it("refuses suspended accounts", async () => {
    const u = await createUser();
    await testDb.user.update({ where: { id: u.id }, data: { status: "SUSPENDED" } });
    await expect(authenticate(u.email, "Correct-Horse-9", ctx("10.4.0.1"))).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("flags sign-ins from a new device/location", async () => {
    const u = await createUser();
    await authenticate(u.email, "Correct-Horse-9", { ip: "10.5.0.1", userAgent: "Laptop" });
    await authenticate(u.email, "Correct-Horse-9", { ip: "10.5.0.99", userAgent: "Unknown phone" });
    expect(await testDb.notification.count({ where: { userId: u.id, title: { contains: "New sign-in" } } })).toBe(1);
    expect(await testDb.auditLog.count({ where: { actorId: u.id, action: "auth.suspicious_login" } })).toBe(1);
  });
});

describe("sessions", () => {
  it("stores only a hash of the token and can be revoked", async () => {
    const u = await createUser();
    const session = await createSession(u, { ip: "1.1.1.1" });
    const token = jar.get(SESSION_COOKIE)!;
    expect(session.tokenHash).toBe(sha256(token));
    expect(session.tokenHash).not.toContain(token);
    await destroyCurrentSession();
    expect((await testDb.session.findUniqueOrThrow({ where: { id: session.id } })).revokedAt).not.toBeNull();
    expect(jar.has(SESSION_COOKIE)).toBe(false);
  });

  it("ignores sessions of suspended users", async () => {
    const u = await createUser();
    await createSession(u, {});
    await testDb.user.update({ where: { id: u.id }, data: { status: "SUSPENDED" } });
    expect(await getSessionRecord()).toBeNull();
  });
});

describe("password reset", () => {
  it("issues a single-use token and revokes existing sessions", async () => {
    const u = await createUser();
    const s = await createSession(u, {});
    await requestPasswordReset(u.email, ctx("10.6.0.1"));
    const job = await testDb.job.findFirstOrThrow({ where: { type: "email.passwordReset", payload: { path: ["userId"], equals: u.id } } });
    const token = (job.payload as { token: string }).token;
    await resetPassword(token, "Brand-New-Pass-1");
    await expect(resetPassword(token, "Another-Pass-22")).rejects.toBeTruthy();
    expect((await testDb.session.findUniqueOrThrow({ where: { id: s.id } })).revokedAt).not.toBeNull();
    await expect(authenticate(u.email, "Brand-New-Pass-1", ctx("10.6.0.2"))).resolves.toBeTruthy();
  });

  it("does not reveal whether an email exists", async () => {
    await expect(requestPasswordReset(`${uid()}@nowhere.example`, ctx("10.6.1.1"))).resolves.toBeUndefined();
  });
});
