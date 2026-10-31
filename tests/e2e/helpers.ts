import { expect, type Page } from "@playwright/test";

export const ADMIN = { email: process.env.SEED_ADMIN_EMAIL ?? "admin@3dapp.test", password: process.env.SEED_ADMIN_PASSWORD ?? "3Dapp-Admin-2026" };
export const SELLER = { email: "kitenge-house@sellers.3dapp.test", password: "Seller-Demo-2026" };
export const CUSTOMER = { email: "customer@3dapp.test", password: "Customer-Demo-2026" };

export async function login(page: Page, email: string, password: string) {
  await page.goto("/login");
  await page.getByLabel("Email", { exact: true }).fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
}

/** Signs in and waits until the app has redirected away from /login (session cookie set). */
export async function signIn(page: Page, email: string, password: string) {
  await login(page, email, password);
  await page.waitForURL((url) => !url.pathname.startsWith("/login"), { timeout: 30_000 });
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

/** Fills the Kenyan delivery address (county → town → estate). */
export async function fillKenyanAddress(page: Page, name = "E2E Guest", phone = "0712345678") {
  await page.getByLabel("Recipient", { exact: true }).fill(name);
  await page.getByLabel("Recipient phone").fill(phone);
  await page.getByLabel("County").selectOption({ label: "Nairobi" });
  await page.getByLabel("Town / area").fill("Kilimani");
  await page.getByLabel("Estate / neighbourhood").fill("Yaya");
}
