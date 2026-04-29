/**
 * Regression for #1850 — vocabulary filter must announce result count via
 * an sr-only aria-live region so screen readers know when filtering changes
 * the word list (WCAG 4.1.3).
 */
import { readFileSync } from "fs";
import { join } from "path";

const src = readFileSync(
  join(__dirname, "../app/vocabulary/page.tsx"),
  "utf-8"
);

describe("Vocabulary filter live region (closes #1850)", () => {
  it("has an sr-only aria-live region for filter result announcements", () => {
    // The filter live region is a div with both aria-live and className="sr-only"
    const idx = src.indexOf('aria-live="polite" aria-atomic="true" className="sr-only"');
    expect(idx).toBeGreaterThan(-1);
    const window = src.slice(Math.max(0, idx - 50), idx + 200);
    expect(window).toContain("aria-live");
  });

  it("filter announcement references filtered word count", () => {
    // The sr-only live region must include the filtered count
    const idx = src.indexOf('aria-live="polite" aria-atomic="true" className="sr-only"');
    expect(idx).toBeGreaterThan(-1);
    const window = src.slice(Math.max(0, idx - 100), idx + 300);
    // Should reference filtered length or a word count variable
    expect(window).toMatch(/filtered\.length|filterCount|wordCount/);
  });
});
