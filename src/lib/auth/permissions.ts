/**
 * Permission catalogue. Permissions are the unit of authorisation; roles are just
 * named bundles of permissions stored in the database (editable by SUPER_ADMIN).
 * This file is the single source of truth used by seeding, guards and tests.
 */
export const PERMISSIONS = {
  "dashboard.view": { group: "Dashboard", description: "View the admin overview" },
  "analytics.view": { group: "Analytics", description: "View analytics and export reports" },

  "products.view": { group: "Catalogue", description: "View products in admin" },
  "products.write": { group: "Catalogue", description: "Create and edit products" },
  "products.delete": { group: "Catalogue", description: "Delete products" },
  "products.publish": { group: "Catalogue", description: "Publish and unpublish products" },
  "categories.manage": { group: "Catalogue", description: "Manage categories and brands" },
  "collections.manage": { group: "Catalogue", description: "Manage collections" },
  "assets.manage": { group: "Catalogue", description: "Upload and manage 3D assets and images" },
  "reviews.moderate": { group: "Catalogue", description: "Moderate product reviews" },

  "inventory.view": { group: "Inventory", description: "View stock levels and movements" },
  "inventory.adjust": { group: "Inventory", description: "Adjust stock levels" },

  "orders.view": { group: "Orders", description: "View orders" },
  "orders.update": { group: "Orders", description: "Update fulfilment and shipping" },
  "orders.cancel": { group: "Orders", description: "Cancel orders" },
  "orders.refund": { group: "Orders", description: "Issue refunds" },

  "customers.view": { group: "Customers", description: "View customers and their history" },
  "customers.manage": { group: "Customers", description: "Suspend and reactivate customers" },

  "content.manage": { group: "Content", description: "Manage banners, sections, navigation" },
  "promotions.manage": { group: "Content", description: "Manage coupons and promotions" },

  "staff.view": { group: "Staff", description: "View staff accounts and activity" },
  "staff.manage": { group: "Staff", description: "Invite, suspend and assign staff roles" },
  "roles.manage": { group: "Staff", description: "Edit roles and permissions" },
  "audit.view": { group: "Staff", description: "View the audit log" },
  "settings.manage": { group: "Settings", description: "Manage store settings" },
} as const;

export type Permission = keyof typeof PERMISSIONS;
export const ALL_PERMISSIONS = Object.keys(PERMISSIONS) as Permission[];

export const ROLE_KEYS = [
  "CUSTOMER",
  "SUPER_ADMIN",
  "ADMIN",
  "INVENTORY_MANAGER",
  "ORDER_MANAGER",
  "CONTENT_MANAGER",
  "CUSTOMER_SUPPORT",
] as const;
export type RoleKey = (typeof ROLE_KEYS)[number];

export const STAFF_ROLE_KEYS = ROLE_KEYS.filter((r) => r !== "CUSTOMER");

export const DEFAULT_ROLES: Record<RoleKey, { name: string; description: string; permissions: Permission[] }> = {
  CUSTOMER: { name: "Customer", description: "Storefront customer — no admin access", permissions: [] },
  SUPER_ADMIN: { name: "Super admin", description: "Unrestricted access including staff & roles", permissions: ALL_PERMISSIONS },
  ADMIN: {
    name: "Administrator",
    description: "Runs the business day to day; cannot manage staff or roles",
    permissions: ALL_PERMISSIONS.filter((p) => !["staff.manage", "roles.manage", "settings.manage"].includes(p)),
  },
  INVENTORY_MANAGER: {
    name: "Inventory manager",
    description: "Stock, products and 3D assets",
    permissions: ["dashboard.view", "products.view", "products.write", "assets.manage", "inventory.view", "inventory.adjust"],
  },
  ORDER_MANAGER: {
    name: "Order manager",
    description: "Fulfilment, shipping, cancellations and refunds",
    permissions: ["dashboard.view", "orders.view", "orders.update", "orders.cancel", "orders.refund", "customers.view", "inventory.view"],
  },
  CONTENT_MANAGER: {
    name: "Content manager",
    description: "Homepage, collections, promotions and editorial",
    permissions: ["dashboard.view", "products.view", "collections.manage", "content.manage", "promotions.manage", "reviews.moderate", "assets.manage"],
  },
  CUSTOMER_SUPPORT: {
    name: "Customer support",
    description: "Read access to customers and orders",
    permissions: ["dashboard.view", "orders.view", "customers.view"],
  },
};

export function isPermission(value: string): value is Permission {
  return value in PERMISSIONS;
}
