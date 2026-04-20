import { defineConfig, devices } from "@playwright/test";

/**
 * Playwright config for E2E tests.
 *
 * Auth bypass is done inline in src/middleware.ts via a PLAYWRIGHT_TEST=1
 * check inside the auth() handler. No file swap, no disruption to any
 * other dev server watching the same source tree.
 */
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: [
    ["html", { outputFolder: "playwright-report", open: "never" }],
    ["list"],
    ["json", { outputFile: "e2e-results.json" }],
  ],

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
    command: "npm run dev -- --port 3100",
    url: "http://localhost:3100",
    reuseExistingServer: !process.env.CI,
    timeout: 120 * 1000,
    env: {
      PLAYWRIGHT_TEST: "1",
      INSTRUMENT_COVERAGE: process.env.CI ? "1" : "",
      NEXT_PUBLIC_API_URL: "http://stub.test/api",
      // NextAuth v5 validates config at module load, so the dev server
      // needs these even though our middleware bypass skips the auth call.
      AUTH_SECRET: "e2e-test-secret-do-not-use-in-prod",
      AUTH_GOOGLE_ID: "e2e-dummy-id",
      AUTH_GOOGLE_SECRET: "e2e-dummy-secret",
    },
  },
});
