import { expect, test } from "@playwright/test";
import { addToBag, fillKenyanAddress } from "./helpers";

async function contact(page: import("@playwright/test").Page, email: string) {
  await page.getByLabel("Email", { exact: true }).fill(email);
  await page.getByLabel("Full name", { exact: true }).fill("E2E Guest");
  await page.getByLabel("Phone", { exact: true }).fill("0712345678");
}

test("guest checkout: Kenyan address, per-seller delivery, sandbox payment → paid order", async ({ page }) => {
  await addToBag(page, "3dapp-essential-tee");
  await page.goto("/checkout");
  await expect(page.getByRole("button", { name: /Place order/ })).toBeVisible();
  await contact(page, "e2e-guest@example.com");
  await fillKenyanAddress(page);
  // Delivery options appear once the county is known; the button stays disabled until one is chosen.
  await expect(page.getByRole("button", { name: /Place order/ })).toBeDisabled();
  await page.getByRole("radio", { name: /Standard delivery/ }).check();
  await expect(page.getByText("KSh").first()).toBeVisible();
  await page.getByText("Test payment (sandbox)").click();
  await page.getByRole("button", { name: /Place order/ }).click();

  await expect(page).toHaveURL(/\/checkout\/sandbox\//);
  await page.getByRole("button", { name: "Approve payment" }).click();
  await expect(page).toHaveURL(/\/orders\/3D-\d{6}-[A-Z0-9]{5}\/confirmation/);
  await expect(page.getByRole("heading", { name: /confirmed/ })).toBeVisible();
});

test("a bag from two designers asks for delivery from each", async ({ page }) => {
  await addToBag(page, "3dapp-essential-tee");
  await addToBag(page, "kitenge-shirt-short-sleeve");
  await page.goto("/cart");
  await expect(page.getByText("ships separately")).toHaveCount(2);
  await page.goto("/checkout");
  await fillKenyanAddress(page);
  await expect(page.getByRole("group", { name: /Kitenge House/ })).toBeVisible();
  await expect(page.getByRole("group", { name: /3Dapp Select/ })).toBeVisible();
  // Kitenge House (Nairobi) offers same-day riders inside Nairobi.
  await expect(page.getByRole("group", { name: /Kitenge House/ }).getByText(/Same-day rider/)).toBeVisible();
});

test("checkout validates required fields before submitting", async ({ page }) => {
  await addToBag(page, "3dapp-essential-tee");
  await page.goto("/checkout");
  await fillKenyanAddress(page);
  await page.getByRole("radio", { name: /Standard delivery/ }).check();
  await page.getByRole("button", { name: /Place order/ }).click();
  await expect(page.getByText("Enter a valid email address")).toBeVisible();
  await expect(page).toHaveURL(/\/checkout$/);
});

test("declined payments can be retried", async ({ page }) => {
  await addToBag(page, "3dapp-essential-tee");
  await page.goto("/checkout");
  await contact(page, "e2e-decline@example.com");
  await fillKenyanAddress(page);
  await page.getByRole("radio", { name: /Pickup/ }).check();
  await page.getByText("Test payment (sandbox)").click();
  await page.getByRole("button", { name: /Place order/ }).click();
  await page.getByRole("button", { name: "Decline" }).click();
  await expect(page.getByRole("heading", { name: "Payment not completed" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Pay now" })).toBeVisible();
});
