import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { resetBrowser } from "../support/request-mock";
import { createUser, ensureRoles, testDb } from "../support/factories";
import { createSession } from "@/lib/auth/session";
import { requirePermission, requireUser } from "@/lib/auth/guards";
import { setStaffAccess, setRolePermissions, setUserStatus } from "@/server/services/admin.service";

beforeAll(ensureRoles);
beforeEach(() => resetBrowser());

async function signIn(role: NonNullable<Parameters<typeof createUser>[0]>["role"], mfaVerified = true) {
  const user = await createUser({ role });
  await createSession(user, { mfaVerified });
  return user;
}

describe("server-side RBAC", () => {
  it("rejects anonymous requests", async () => {
    await expect(requireUser()).rejects.toMatchObject({ code: "UNAUTHENTICATED" });
    await expect(requirePermission("orders.view")).rejects.toMatchObject({ code: "UNAUTHENTICATED" });
  });

  it("never lets customers reach admin operations", async () => {
    await signIn("CUSTOMER");
    await expect(requirePermission("dashboard.view")).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("even a customer flagged as staff with no roles gets nothing", async () => {
    const u = await createUser({ role: "CUSTOMER", staff: true });
    await createSession(u, { mfaVerified: true });
    await expect(requirePermission("orders.view")).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("grants exactly the permissions of the role", async () => {
    await signIn("INVENTORY_MANAGER");
    await expect(requirePermission("inventory.adjust")).resolves.toBeTruthy();
    await expect(requirePermission("orders.refund")).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(requirePermission("staff.manage")).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("support agents are read-only", async () => {
    await signIn("CUSTOMER_SUPPORT");
    await expect(requirePermission("orders.view")).resolves.toBeTruthy();
    await expect(requirePermission("orders.update")).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("requires a completed MFA challenge for staff", async () => {
    await signIn("SUPER_ADMIN", false);
    await expect(requirePermission("dashboard.view")).rejects.toMatchObject({ code: "FORBIDDEN", message: expect.stringMatching(/Multi-factor/) });
  });

  it("direct permission grants extend a role", async () => {
    const admin = await signIn("SUPER_ADMIN");
    const actor = (await requirePermission("staff.manage"))!;
    const target = await createUser({ role: "CUSTOMER_SUPPORT" });
    await setStaffAccess(target.id, ["CUSTOMER_SUPPORT"], ["orders.refund"], actor);
    resetBrowser();
    await createSession(target, { mfaVerified: true });
    await expect(requirePermission("orders.refund")).resolves.toBeTruthy();
    expect(admin.id).toBeTruthy();
  });

  it("role edits take effect immediately and super admin cannot be stripped", async () => {
    await signIn("SUPER_ADMIN");
    const actor = await requirePermission("roles.manage");
    const support = await testDb.role.findUniqueOrThrow({ where: { key: "CUSTOMER_SUPPORT" } });
    const superRole = await testDb.role.findUniqueOrThrow({ where: { key: "SUPER_ADMIN" } });
    await expect(setRolePermissions(superRole.id, [], actor)).rejects.toBeTruthy();
    await setRolePermissions(support.id, ["dashboard.view", "orders.view", "customers.view", "analytics.view"], actor);
    resetBrowser();
    await signIn("CUSTOMER_SUPPORT");
    await expect(requirePermission("analytics.view")).resolves.toBeTruthy();
    // restore defaults for other tests
    await ensureRoles();
  });

  it("non-super admins cannot escalate to super admin or suspend one", async () => {
    const victim = await createUser({ role: "SUPER_ADMIN" });
    const adminUser = await createUser({ role: "ADMIN" });
    const perm = await testDb.permission.findUniqueOrThrow({ where: { key: "staff.manage" } });
    await testDb.userPermission.create({ data: { userId: adminUser.id, permissionId: perm.id } });
    await createSession(adminUser, { mfaVerified: true });
    const actor = await requirePermission("staff.manage");
    const helper = await createUser({ role: "ORDER_MANAGER" });
    await expect(setStaffAccess(helper.id, ["SUPER_ADMIN"], [], actor)).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(setUserStatus(victim.id, "SUSPENDED", actor, "test")).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("suspending a user revokes their sessions immediately", async () => {
    await signIn("SUPER_ADMIN");
    const actor = await requirePermission("customers.manage");
    const customer = await createUser();
    resetBrowser();
    const s = await createSession(customer, {});
    await setUserStatus(customer.id, "SUSPENDED", actor, "fraud");
    expect((await testDb.session.findUniqueOrThrow({ where: { id: s.id } })).revokedAt).not.toBeNull();
    await expect(requireUser()).rejects.toMatchObject({ code: "UNAUTHENTICATED" });
  });
});
