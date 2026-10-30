import { expect, test } from "@playwright/test";
import { ADMIN, login } from "./helpers";

test("customers can register, see their dashboard and sign out", async ({ page }) => {
  const email = `e2e-${Date.now()}@example.com`;
  await page.goto("/register");
  await page.getByLabel("Full name", { exact: true }).fill("E2E Shopper");
  await page.getByLabel("Email", { exact: true }).fill(email);
  await page.getByLabel("Password", { exact: true }).fill("Correct-Horse-9");
  await page.getByLabel("Confirm password").fill("Correct-Horse-9");
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page).toHaveURL(/\/account/);
  await expect(page.getByText("Total purchases")).toBeVisible();
  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page).toHaveURL("/");
});

test("weak passwords are rejected", async ({ page }) => {
  await page.goto("/register");
  await page.getByLabel("Full name", { exact: true }).fill("Weak");
  await page.getByLabel("Email", { exact: true }).fill(`weak-${Date.now()}@example.com`);
  await page.getByLabel("Password", { exact: true }).fill("password");
  await page.getByLabel("Confirm password").fill("password");
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page.getByText(/Use at least 10 characters|Mix upper and lower case/)).toBeVisible();
});

test("customers cannot reach the admin dashboard or admin APIs", async ({ page }) => {
  await login(page, "customer@atelier.local", "Customer-Demo-2026");
  await expect(page).toHaveURL(/\/account/);
  await page.goto("/admin");
  await expect(page).not.toHaveURL(/\/admin/);
  const api = await page.request.get("/api/admin/analytics/export?report=revenue");
  expect(api.status()).toBe(403);
  const upload = await page.request.post("/api/admin/uploads", { data: { kind: "model", fileName: "x.glb", contentType: "model/gltf-binary", size: 10 }, headers: { origin: "http://localhost:3000" } });
  expect(upload.status()).toBe(403);
});

test("anonymous visitors are sent to sign in for protected areas", async ({ page }) => {
  await page.goto("/account/orders");
  await expect(page).toHaveURL(/\/login\?next=%2Faccount%2Forders/);
});

test("cross-site mutations are rejected (CSRF)", async ({ request }) => {
  const res = await request.post("/api/wishlist", { data: { productId: "x" }, headers: { origin: "https://evil.example" } });
  expect(res.status()).toBe(403);
});

test("wrong credentials show a generic error", async ({ page }) => {
  await login(page, ADMIN.email, "definitely-wrong");
  await expect(page.getByText("Incorrect email or password")).toBeVisible();
});
