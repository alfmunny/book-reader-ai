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
    // Must have a visually-hidden live region (not just the export status div)
    // that announces filter results
    expect(src).toContain("sr-only");
    // That sr-only element must be inside or accompanied by aria-live
    const srIdx = src.indexOf("sr-only");
    const window = src.slice(Math.max(0, srIdx - 300), srIdx + 300);
    expect(window).toContain("aria-live");
  });

  it("filter announcement references filtered word count", () => {
    // The sr-only live region must include the filtered count
    const srIdx = src.indexOf("sr-only");
    expect(srIdx).toBeGreaterThan(-1);
    // Find the aria-live region containing sr-only
    const window = src.slice(Math.max(0, srIdx - 400), srIdx + 400);
    // Should reference filtered length or a word count variable
    expect(window).toMatch(/filtered\.length|filterCount|wordCount/);
  });
});
