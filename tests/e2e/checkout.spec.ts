import { expect, test } from "@playwright/test";
import { addToBag } from "./helpers";

test("guest checkout with the sandbox gateway ends in a paid order", async ({ page }) => {
  await addToBag(page, "heavyweight-tee");
  await page.goto("/checkout");
  await expect(page.getByRole("button", { name: /Place order/ })).toBeVisible();
  await page.getByLabel("Email", { exact: true }).fill("e2e-guest@example.com");
  await page.getByLabel("Full name", { exact: true }).fill("E2E Guest");
  await page.getByLabel("Phone", { exact: true }).fill("+254700000123");
  await page.getByLabel("Recipient", { exact: true }).fill("E2E Guest");
  await page.getByLabel("Recipient phone").fill("+254700000123");
  await page.getByLabel("Street address").fill("12 Riverside Drive");
  await page.getByLabel("City").fill("Nairobi");
  await page.getByText("Test payment (sandbox)").click();
  await page.getByRole("button", { name: /Place order/ }).click();

  await expect(page).toHaveURL(/\/checkout\/sandbox\//);
  await expect(page.getByText("Sandbox gateway")).toBeVisible();
  await page.getByRole("button", { name: "Approve payment" }).click();

  await expect(page).toHaveURL(/\/orders\/AT-.*\/confirmation/);
  await expect(page.getByRole("heading", { name: /confirmed/ })).toBeVisible();
});

test("checkout validates required fields before submitting", async ({ page }) => {
  await addToBag(page, "heavyweight-tee");
  await page.goto("/checkout");
  await expect(page.getByRole("button", { name: /Place order/ })).toBeVisible();
  await page.getByRole("button", { name: /Place order/ }).click();
  await expect(page.getByText("Enter a valid email address")).toBeVisible();
  await expect(page).toHaveURL(/\/checkout$/);
});

test("declined payments can be retried", async ({ page }) => {
  await addToBag(page, "heavyweight-tee");
  await page.goto("/checkout");
  await expect(page.getByRole("button", { name: /Place order/ })).toBeVisible();
  await page.getByLabel("Email", { exact: true }).fill("e2e-decline@example.com");
  await page.getByLabel("Full name", { exact: true }).fill("Decline Test");
  await page.getByLabel("Phone", { exact: true }).fill("+254700000124");
  await page.getByLabel("Shipping method").getByText("Atelier pickup").click();
  await page.getByText("Test payment (sandbox)").click();
  await page.getByRole("button", { name: /Place order/ }).click();
  await page.getByRole("button", { name: "Decline" }).click();
  await expect(page.getByRole("heading", { name: "Payment not completed" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Pay now" })).toBeVisible();
});
