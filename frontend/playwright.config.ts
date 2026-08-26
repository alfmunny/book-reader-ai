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
  // Stays at 1. Two workers were tried and reverted: the specs themselves are
  // independent (each stubs the backend with page.route()), but they share one
  // `next dev` server, which compiles each route on first request. Two workers
  // requesting different routes at once pushed the first paint past the 5s
  // expect timeout — "vocab sidebar: clicking an occurrence closes the sidebar"
  // failed at 8.0s and passed on retry at 4.3s, tripping the fail-on-flaky gate.
  // Raising this is worth revisiting only together with serving a production
  // build (`next build` + `next start`), which removes lazy compilation.
  workers: process.env.CI ? 1 : undefined,
  reporter: [
    ["list"],
    ["json", { outputFile: "e2e-results.json" }],
    ["html", { outputFolder: "playwright-report", open: "never" }],
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
      NEXT_PUBLIC_API_URL: "http://stub.test/api",
      // NextAuth v5 validates config at module load, so the dev server
      // needs these even though our middleware bypass skips the auth call.
      AUTH_SECRET: "e2e-test-secret-do-not-use-in-prod",
      AUTH_GOOGLE_ID: "e2e-dummy-id",
      AUTH_GOOGLE_SECRET: "e2e-dummy-secret",
    },
  },
});
