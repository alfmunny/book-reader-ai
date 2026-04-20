/**
 * Coverage-collecting test fixture for E2E tests.
 *
 * In CI, starts V8 JS coverage before each test and writes raw coverage
 * data to .v8-coverage/ after each test. A post-test script converts
 * this to Istanbul format. Locally, this is a plain passthrough.
 */
import { test as base, expect } from "@playwright/test";
import * as fs from "fs";
import * as path from "path";

const COVERAGE_DIR = path.join(__dirname, "..", ".v8-coverage");
const collectCoverage = !!process.env.CI;

export const test = base.extend({
  page: async ({ page, browserName }, use, testInfo) => {
    if (collectCoverage && browserName === "chromium") {
      await page.coverage.startJSCoverage({ resetOnNavigation: false });
    }

    await use(page);

    if (collectCoverage && browserName === "chromium") {
      try {
        const entries = await page.coverage.stopJSCoverage();
        const filtered = entries.filter(
          (e) =>
            e.url.includes("localhost") &&
            !e.url.includes("node_modules") &&
            !e.url.includes("_next/static/chunks/webpack")
        );
        if (filtered.length > 0) {
          fs.mkdirSync(COVERAGE_DIR, { recursive: true });
          const name = testInfo.testId.replace(/[^a-zA-Z0-9]/g, "_");
          fs.writeFileSync(
            path.join(COVERAGE_DIR, `${name}.json`),
            JSON.stringify(filtered)
          );
        }
      } catch {
        // Coverage collection failed — don't break the test
      }
    }
  },
});

export { expect };
export type { Page } from "@playwright/test";
