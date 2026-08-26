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
  // Two workers, now that the CI server below is a production build. The first
  // attempt at this (#2710) went flaky because `next dev` compiled routes on
  // first request and two workers racing that blew the 5s expect timeout; with
  // no lazy compilation the per-route cost is uniform. Held at 2 rather than
  // the runner's 4 cores because each worker drives a Chromium instance and
  // they still share one server process.
  workers: process.env.CI ? 2 : undefined,
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
    // CI serves a production build; local runs keep `next dev` for fast
    // iteration. `next dev` compiles each route on first request, which is
    // dead time in every spec and what made a second worker flaky (#2710) —
    // a first paint could outrun the 5s expect timeout. `next start` serves
    // an already-built app, so route cost is uniform and workers are safe.
    // Set CI=1 locally to exercise this exact path.
    command: process.env.CI
      ? "npm run build && npm run start -- --port 3100"
      : "npm run dev -- --port 3100",
    url: "http://localhost:3100",
    reuseExistingServer: !process.env.CI,
    // The CI command builds first, so it needs more than a server boot's worth.
    timeout: (process.env.CI ? 300 : 120) * 1000,
    env: {
      // Applies to the build as well as the server. That matters twice over:
      // NEXT_PUBLIC_API_URL is inlined into client bundles at build time, and
      // middleware env is baked into the Edge bundle — so the auth bypass has
      // to be present when `next build` runs, not just when the server boots.
      //
      // This makes the resulting build auth-bypassed. It never leaves the E2E
      // job: nothing uploads or deploys it, and Vercel builds from its own
      // pipeline. Never reuse this artifact.
      PLAYWRIGHT_TEST: "1",
      NEXT_PUBLIC_API_URL: "http://stub.test/api",
      // NextAuth v5 validates config at module load, so the server
      // needs these even though our middleware bypass skips the auth call.
      AUTH_SECRET: "e2e-test-secret-do-not-use-in-prod",
      AUTH_GOOGLE_ID: "e2e-dummy-id",
      AUTH_GOOGLE_SECRET: "e2e-dummy-secret",
      // A production server does not trust localhost by default, so every
      // /api/auth/session call answered with UntrustedHost. `next dev` trusts
      // it implicitly, which is why this only surfaced on the built app.
      AUTH_TRUST_HOST: "true",
    },
  },
});
