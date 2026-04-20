/**
 * Shared test fixture for E2E tests.
 *
 * Re-exports `test` and `expect` from Playwright. When monocart-reporter
 * is active (CI), it collects V8 coverage automatically — no per-test
 * coverage code needed here.
 */
export { test, expect } from "@playwright/test";
export type { Page } from "@playwright/test";
