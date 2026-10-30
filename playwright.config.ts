import { defineConfig, devices } from "@playwright/test";

const BASE_URL = process.env.E2E_BASE_URL ?? "http://localhost:3000";
// Software WebGL so the 3D showroom renders in headless CI.
const webgl = ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"];

export default defineConfig({
  testDir: "tests/e2e",
  timeout: 90_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: BASE_URL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    launchOptions: { args: webgl, ...(process.env.PW_CHROMIUM_PATH ? { executablePath: process.env.PW_CHROMIUM_PATH } : {}) },
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } } },
    { name: "mobile-touch", use: { ...devices["Pixel 7"] }, testMatch: /showroom|storefront/ },
    {
      name: "no-webgl",
      use: { ...devices["Desktop Chrome"], launchOptions: { args: ["--disable-webgl", "--disable-3d-apis"] } },
      testMatch: /showroom/,
    },
  ],
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : { command: "npm run dev", url: `${BASE_URL}/api/health`, reuseExistingServer: true, timeout: 180_000 },
});
