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
  await page.goto("/shop?q=ankara");
  await expect(page.getByText(/Ankara Wrap Midi Dress/).first()).toBeVisible();
  await page.goto("/shop?category=bags");
  const count = await page.locator("article").count();
  expect(count).toBeGreaterThan(0);
  await expect(page.getByText(/Leather Weekender Bag|Sisal Kiondo Tote/).first()).toBeVisible();
});

test("product page supports variant selection and adding to the bag", async ({ page }) => {
  await addToBag(page, "linen-kaftan");
  const drawer = page.getByRole("dialog");
  await expect(drawer).toContainText("Linen Kaftan");
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

test("product pages show the seller, KES prices and a delivery check", async ({ page }) => {
  await page.goto("/products/kitenge-shirt-short-sleeve");
  await expect(page.getByText("Sold by")).toBeVisible();
  await expect(page.getByRole("link", { name: "Kitenge House" }).first()).toBeVisible();
  await expect(page.getByText(/KSh\s?3,200/).first()).toBeVisible();
  await page.getByLabel("Your county").selectOption({ label: "Turkana" });
  await expect(page.getByText(/Courier/)).toBeVisible();
  // Seeded 3D models are generic silhouettes, so the page must say so.
  await expect(page.getByText(/not a scan of the real fabric/)).toBeVisible();
});

test("designers directory filters by county and links to stores", async ({ page }) => {
  await page.goto("/designers?county=mombasa");
  await expect(page.getByRole("heading", { name: "Pwani Threads" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Kitenge House" })).toHaveCount(0);
  await page.getByRole("heading", { name: "Pwani Threads" }).click();
  await expect(page).toHaveURL(/\/designers\/pwani-threads/);
  await expect(page.getByText("Nyali, Mombasa").first()).toBeVisible();
});

test("Kiswahili and Lite mode are one click away", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("combobox", { name: "Language" }).selectOption("sw");
  await expect(page.locator("html")).toHaveAttribute("lang", "sw");
  await expect(page.locator("footer").getByRole("link", { name: "Wabunifu" })).toBeVisible();
  await page.getByRole("button", { name: /Tumia hali nyepesi|Use Lite mode/ }).first().click();
  await expect(page.getByText(/Hali nyepesi imewashwa/)).toBeVisible();
  // Reset for later tests.
  await page.getByRole("button", { name: /Zima hali nyepesi|Turn off Lite mode/ }).first().click();
  await page.getByRole("combobox", { name: "Lugha" }).selectOption("en-KE");
  await expect(page.locator("html")).toHaveAttribute("lang", "en-KE");
});
