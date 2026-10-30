import { expect, test } from "@playwright/test";
import { ADMIN, CUSTOMER, SELLER, signIn } from "./helpers";

test("an approved seller sees only their own dashboard", async ({ page }) => {
  await signIn(page, SELLER.email, SELLER.password);
  await page.goto("/seller");
  await expect(page.getByRole("heading", { name: /Habari, Kitenge House/ })).toBeVisible();
  await page.goto("/seller/orders?tab=done");
  await expect(page.getByRole("heading", { name: "Orders" })).toBeVisible();
  // Sellers are not staff: the admin area is off-limits.
  await page.goto("/admin");
  await expect(page).not.toHaveURL(/\/admin$/);
});

test("seller portal 404s for another seller's order", async ({ page }) => {
  await signIn(page, SELLER.email, SELLER.password);
  const res = await page.goto("/seller/orders/not-mine-or-anyones");
  expect(res?.status()).toBe(404);
});

test("customers without a store are sent to onboarding", async ({ page }) => {
  await signIn(page, CUSTOMER.email, CUSTOMER.password);
  await page.goto("/seller");
  await expect(page).toHaveURL(/\/sell$/);
  await expect(page.getByRole("heading", { name: "Open your store" })).toBeVisible();
  await expect(page.getByLabel("Business or brand name")).toBeVisible();
});

test("admins review applications, listings and payouts", async ({ page }) => {
  await signIn(page, ADMIN.email, ADMIN.password);
  await page.goto("/admin");
  await expect(page.getByText("Seller applications")).toBeVisible();
  await page.goto("/admin/sellers?status=PENDING");
  await expect(page.getByRole("link", { name: "Nyokabi Designs" })).toBeVisible();
  await page.goto("/admin/finance");
  await expect(page.getByText(/wallets match the ledger/)).toBeVisible();
  await page.goto("/admin/finance/payouts");
  await expect(page.getByRole("heading", { name: "Seller payouts" })).toBeVisible();
});

test("private seller documents are never served from /media", async ({ request }) => {
  const res = await request.get("/media/private/documents/2026-10/anything.pdf");
  expect(res.status()).toBe(404);
});
