/**
 * Coverage-collecting test fixture for Playwright.
 *
 * When the dev server is instrumented with babel-plugin-istanbul
 * (INSTRUMENT_COVERAGE=1), `window.__coverage__` contains Istanbul
 * coverage data after each page interaction. This fixture collects
 * it after every test and writes it to .nyc_output/ for merging
 * with Jest coverage.
 *
 * Usage: import { test, expect } from "./base" instead of "@playwright/test"
 */
import { test as base, expect } from "@playwright/test";
import * as fs from "fs";
import * as path from "path";
import * as crypto from "crypto";

const COVERAGE_DIR = path.join(__dirname, "..", ".nyc_output");

export const test = base.extend({
  page: async ({ page }, use) => {
    await use(page);

    try {
      const coverage = await page.evaluate(
        () => (window as any).__coverage__
      );
      if (coverage && Object.keys(coverage).length > 0) {
        fs.mkdirSync(COVERAGE_DIR, { recursive: true });
        const id = crypto.randomUUID();
        fs.writeFileSync(
          path.join(COVERAGE_DIR, `e2e-${id}.json`),
          JSON.stringify(coverage)
        );
      }
    } catch {
      // No coverage data — instrumentation not enabled; skip silently
    }
  },
});

export { expect };
