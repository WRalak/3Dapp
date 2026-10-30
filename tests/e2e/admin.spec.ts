import { expect, test } from "@playwright/test";
import { ADMIN, login } from "./helpers";

test.beforeEach(async ({ page }) => {
  await login(page, ADMIN.email, ADMIN.password);
  await expect(page).toHaveURL(/\/admin/);
});

test("overview shows live KPIs", async ({ page }) => {
  await expect(page.getByRole("heading", { name: "Overview" })).toBeVisible();
  await expect(page.getByText("Total revenue")).toBeVisible();
  await expect(page.getByRole("img", { name: "Revenue over time" })).toBeVisible();
});

test("admins can create a product that appears in the store", async ({ page }) => {
  const stamp = Date.now().toString(36).toUpperCase();
  await page.goto("/admin/products/new");
  await page.getByLabel("Name", { exact: true }).fill(`E2E Linen Dress ${stamp}`);
  await page.getByLabel("Description", { exact: true }).fill("An end-to-end tested linen dress.");
  await page.getByLabel("Brand").selectOption({ index: 1 });
  await page.getByLabel("Category").selectOption({ index: 1 });
  await page.getByLabel("Garment type").selectOption("DRESS");
  await page.getByLabel("Status").selectOption("PUBLISHED");
  await page.getByLabel("Price", { exact: true }).fill("199");
  await page.getByLabel("SKU", { exact: true }).fill(`E2E-${stamp}`);
  await page.getByRole("button", { name: "Create product" }).click();
  await expect(page).toHaveURL(/\/admin\/products\/[a-z0-9]+$/);
  await page.goto(`/shop?q=${stamp}`);
  await expect(page.getByText(`E2E Linen Dress ${stamp}`)).toBeVisible();
});

test("form validation errors are shown inline", async ({ page }) => {
  await page.goto("/admin/products/new");
  await page.getByRole("button", { name: "Create product" }).click();
  await expect(page.getByText("Choose a brand")).toBeVisible();
});

test("admin can view an order with its immutable history", async ({ page }) => {
  await page.goto("/admin/orders");
  await page.locator("tbody a").first().click();
  await expect(page.getByText("Immutable — enforced by the database.")).toBeVisible();
});

test("analytics exports CSV", async ({ page }) => {
  const res = await page.request.get("/api/admin/analytics/export?report=revenue");
  expect(res.status()).toBe(200);
  expect(res.headers()["content-type"]).toContain("text/csv");
  expect(await res.text()).toMatch(/^date,revenue,orders/);
});
