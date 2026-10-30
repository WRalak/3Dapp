import { expect, test } from "@playwright/test";
import { addToBag } from "./helpers";

test("homepage renders editorial sections from the database", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await expect(page.getByRole("heading", { name: "New arrivals" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Best sellers" })).toBeVisible();
  await expect(page.locator("article").first()).toBeVisible();
});

test("search and filters narrow the catalogue", async ({ page }) => {
  await page.goto("/shop?q=wool");
  await expect(page.getByText(/Double-Faced Wool Coat/).first()).toBeVisible();
  await page.goto("/shop?category=bags");
  const count = await page.locator("article").count();
  expect(count).toBeGreaterThan(0);
  await expect(page.getByText(/Structured Tote|Crescent Shoulder Bag|Weekender Holdall/).first()).toBeVisible();
});

test("product page supports variant selection and adding to the bag", async ({ page }) => {
  await addToBag(page, "linen-camp-shirt");
  const drawer = page.getByRole("dialog");
  await expect(drawer).toContainText("Linen Camp Shirt");
  await expect(drawer).toContainText(/Your bag \([1-9]\d*\)/);
});

test("unknown products return 404", async ({ page }) => {
  const res = await page.goto("/products/does-not-exist");
  expect(res?.status()).toBe(404);
});

test("security headers and CSP are present", async ({ page }) => {
  const res = await page.goto("/");
  const h = res!.headers();
  expect(h["content-security-policy"]).toMatch(/script-src 'self' 'nonce-/);
  expect(h["content-security-policy"]).toContain("frame-ancestors 'none'");
  expect(h["x-content-type-options"]).toBe("nosniff");
  expect(h["x-frame-options"]).toBe("DENY");
});
