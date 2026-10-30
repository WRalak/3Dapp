import { describe, expect, it } from "vitest";
import { hasPermissions, resolvePermissions, staffMfaSatisfied } from "@/lib/auth/guards";
import { ALL_PERMISSIONS, DEFAULT_ROLES } from "@/lib/auth/permissions";

const role = (...keys: string[]) => ({ permissions: keys.map((key) => ({ permission: { key } })) });

describe("permission resolution", () => {
  it("unions role and direct permissions and drops unknown keys", () => {
    const perms = resolvePermissions([role("orders.view"), role("orders.view", "orders.refund")], [{ permission: { key: "analytics.view" } }, { permission: { key: "made.up" } }]);
    expect(perms).toEqual(["analytics.view", "orders.refund", "orders.view"]);
  });

  it("requires staff status as well as every listed permission", () => {
    expect(hasPermissions({ isStaff: true, permissions: ["orders.view", "orders.refund"] }, ["orders.view", "orders.refund"])).toBe(true);
    expect(hasPermissions({ isStaff: true, permissions: ["orders.view"] }, ["orders.view", "orders.refund"])).toBe(false);
    expect(hasPermissions({ isStaff: false, permissions: ALL_PERMISSIONS }, ["orders.view"])).toBe(false);
    expect(hasPermissions(null, [])).toBe(false);
  });

  it("enforces MFA for staff only when required", () => {
    expect(staffMfaSatisfied({ isStaff: true, mfaVerified: false }, true)).toBe(false);
    expect(staffMfaSatisfied({ isStaff: true, mfaVerified: true }, true)).toBe(true);
    expect(staffMfaSatisfied({ isStaff: true, mfaVerified: false }, false)).toBe(true);
    expect(staffMfaSatisfied({ isStaff: false, mfaVerified: false }, true)).toBe(true);
  });
});

describe("default roles (least privilege)", () => {
  it("customers hold no admin permissions", () => expect(DEFAULT_ROLES.CUSTOMER.permissions).toEqual([]));
  it("super admins hold everything", () => expect(new Set(DEFAULT_ROLES.SUPER_ADMIN.permissions)).toEqual(new Set(ALL_PERMISSIONS)));
  it("only super admins can manage staff and roles", () => {
    for (const [key, r] of Object.entries(DEFAULT_ROLES)) {
      if (key === "SUPER_ADMIN") continue;
      expect(r.permissions).not.toContain("staff.manage");
      expect(r.permissions).not.toContain("roles.manage");
    }
  });
  it("support agents are read-only", () => {
    expect(DEFAULT_ROLES.CUSTOMER_SUPPORT.permissions.every((p) => p.endsWith(".view"))).toBe(true);
  });
  it("inventory managers cannot touch money", () => {
    expect(DEFAULT_ROLES.INVENTORY_MANAGER.permissions).not.toContain("orders.refund");
  });
});
