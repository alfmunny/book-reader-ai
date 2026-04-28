/**
 * Regression for #1860 — home page book discovery search results must
 * announce the result count to screen readers via an aria-live region
 * (WCAG 4.1.3 Status Messages).
 */
import { readFileSync } from "fs";
import { join } from "path";

const src = readFileSync(join(__dirname, "../app/page.tsx"), "utf-8");

describe("Home page discovery search live region (closes #1860)", () => {
  it("has an sr-only aria-live region for search result announcements", () => {
    expect(src).toContain("sr-only");
    const srIdx = src.indexOf("sr-only");
    const window = src.slice(Math.max(0, srIdx - 300), srIdx + 300);
    expect(window).toContain("aria-live");
  });

  it("live region references search result count", () => {
    const srIdx = src.indexOf("sr-only");
    expect(srIdx).toBeGreaterThan(-1);
    const window = src.slice(Math.max(0, srIdx - 400), srIdx + 400);
    expect(window).toMatch(/searchResults\.length|resultCount|searchCount/);
  });
});
