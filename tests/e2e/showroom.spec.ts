import { expect, test } from "@playwright/test";

/**
 * Runs in three projects: desktop (mouse), mobile-touch (Pixel 7) and no-webgl, which must
 * get the 2D gallery fallback.
 */
test("the showroom renders the rail and lets shoppers inspect a garment", async ({ page }, info) => {
  await page.goto("/showroom");
  if (info.project.name === "no-webgl") {
    await expect(page.getByTestId("showroom-fallback")).toBeVisible();
    await page.getByTestId("showroom-fallback").locator("li button").first().click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await expect(page.getByRole("dialog").getByRole("button", { name: "Add to bag" })).toBeVisible();
    return;
  }

  const rail = page.getByRole("application", { name: /Clothing rail/ });
  await expect(rail).toBeVisible();
  await expect(rail.locator("canvas")).toBeVisible();
  await expect(page.getByText(/1 \/ \d+/)).toBeVisible();

  const box = (await rail.boundingBox())!;
  if (info.project.name === "mobile-touch") {
    await page.getByRole("button", { name: "Next garment" }).tap();
    await expect(page.getByText(/^2 \/ \d+/)).toBeVisible({ timeout: 10_000 });
    // Tap the centred garment → it lifts into the inspection pose. (Models stream in after
    // the window moves; retry the tap until the scene has settled.)
    await page.waitForLoadState("networkidle");
    await expect(async () => {
      await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height * 0.55);
      await expect(page.getByRole("toolbar", { name: "3D inspection controls" })).toBeVisible({ timeout: 2_000 });
    }).toPass({ timeout: 20_000 });
    await expect(page.getByRole("complementary").getByRole("button", { name: "Add to bag" })).toBeVisible();
    await page.getByRole("button", { name: "Back to rail" }).tap();
    await expect(page.getByRole("toolbar", { name: "3D inspection controls" })).toBeHidden();
    return;
  }
  await page.mouse.move(box.x + box.width * 0.7, box.y + box.height * 0.5);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.2, box.y + box.height * 0.5, { steps: 12 });
  await page.mouse.up();
  await expect(page.getByText(/^[2-9] \/ \d+|^\d{2} \/ \d+/)).toBeVisible({ timeout: 10_000 });

  // Keyboard is a first-class input: Enter lifts the focused garment, Escape returns it.
  await rail.focus();
  await page.keyboard.press("Enter");
  const panel = page.getByRole("complementary");
  await expect(panel.getByRole("button", { name: "Add to bag" })).toBeVisible();
  await expect(page.getByRole("toolbar", { name: "3D inspection controls" })).toBeVisible();
  await page.getByRole("button", { name: "Rotate right" }).click();
  await page.getByRole("button", { name: "Zoom in" }).click();
  await rail.focus();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("toolbar", { name: "3D inspection controls" })).toBeHidden();
});

test("the 2D view can be forced from the showroom page", async ({ page }) => {
  await page.goto("/showroom?mode=2d");
  await expect(page.getByTestId("showroom-fallback")).toBeVisible();
});
