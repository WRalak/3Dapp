import { expect, type Page } from "@playwright/test";

export const ADMIN = { email: process.env.SEED_ADMIN_EMAIL ?? "admin@atelier.local", password: process.env.SEED_ADMIN_PASSWORD ?? "Atelier-Admin-2026" };

export async function login(page: Page, email: string, password: string) {
  await page.goto("/login");
  await page.getByLabel("Email", { exact: true }).fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
}

/** Picks an in-stock variant through the public API so tests don't depend on random seed stock. */
export async function inStockVariant(page: Page, slug: string) {
  const res = await page.request.get(`/api/products/${slug}`);
  expect(res.ok()).toBeTruthy();
  const product = (await res.json()) as { id: string; colors: { name: string }[]; variants: { color: string; size: string; available: number }[] };
  const v = product.variants.find((x) => x.available > 0);
  if (!v) throw new Error(`No stock for ${slug}`);
  return { product, variant: v };
}

export async function addToBag(page: Page, slug: string) {
  const { variant } = await inStockVariant(page, slug);
  await page.goto(`/products/${slug}`);
  await page.getByRole("button", { name: variant.color, exact: true }).first().click();
  await page.getByRole("button", { name: variant.size, exact: true }).first().click();
  await page.getByRole("button", { name: "Add to bag" }).click();
  await expect(page.getByText("Added to your bag")).toBeVisible();
  return variant;
}
