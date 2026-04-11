import { defineConfig, devices } from "@playwright/test";

/**
 * Playwright config for E2E tests.
 * - Starts Next.js dev server with PLAYWRIGHT_TEST=1 so middleware bypasses auth
 * - Uses a stub API base URL so all requests are intercepted and mocked
 * - Chromium only (enough for our flows; add more browsers if needed)
 */
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: [["html", { outputFolder: "playwright-report", open: "never" }], ["list"]],

  use: {
    baseURL: "http://localhost:3100",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },

  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],

  webServer: {
    command: "PLAYWRIGHT_TEST=1 NEXT_PUBLIC_API_URL=http://stub.test/api npm run dev -- --port 3100",
    url: "http://localhost:3100",
    reuseExistingServer: !process.env.CI,
    timeout: 120 * 1000,
  },
});
