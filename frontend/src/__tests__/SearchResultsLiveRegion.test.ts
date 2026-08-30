/**
 * Regression for #1848 — search results page must announce completion via
 * an aria-live region so screen readers know results have loaded (WCAG 4.1.3).
 */
import { readFileSync } from "fs";
import { join } from "path";

const src = readFileSync(
  join(__dirname, "../app/(shell)/search/page.tsx"),
  "utf-8"
);

describe("Search results live region (closes #1848)", () => {
  it("SearchResultsInner has an aria-live status region for result announcements", () => {
    expect(src).toContain('aria-live="polite"');
  });

  it("status region is aria-atomic so the full count is read at once", () => {
    expect(src).toContain('aria-atomic="true"');
  });

  it("status region uses role=status", () => {
    // Find the aria-live region and confirm it also carries role="status"
    const idx = src.indexOf('aria-live="polite"');
    expect(idx).toBeGreaterThan(-1);
    const window = src.slice(Math.max(0, idx - 200), idx + 200);
    expect(window).toContain('role="status"');
  });
});
