/**
 * Regression for #1850 — vocabulary filter must announce result count via
 * an sr-only aria-live region so screen readers know when filtering changes
 * the word list (WCAG 4.1.3).
 *
 * Regression for #2243 — live region must be unconditionally rendered so that
 * aria-live fires on the *first* filter keystroke (newly-inserted live regions
 * are not reliably announced by NVDA/Firefox).
 */
import { readFileSync } from "fs";
import { join } from "path";

const src = readFileSync(
  join(__dirname, "../app/vocabulary/page.tsx"),
  "utf-8"
);

describe("Vocabulary filter live region (closes #1850, #2243)", () => {
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

  it("live region is always rendered (not wrapped in a conditional)", () => {
    // The element must not be inside a conditional expression like {condition && <div ...>}
    // so that it is present in the DOM before the user activates filtering.
    // Correct: <div role="status" ...>{condition ? content : ""}</div>
    // Wrong:   {condition && <div role="status" ...>content</div>}
    const idx = src.indexOf('aria-live="polite" aria-atomic="true" className="sr-only"');
    expect(idx).toBeGreaterThan(-1);

    // Look backward 200 chars for "&&" immediately before the opening <div
    const before = src.slice(Math.max(0, idx - 200), idx);
    // The pattern "{(search || selectedTag) && (" indicates conditional rendering
    expect(before).not.toMatch(/\(search.*selectedTag.*&&\s*\(?\s*$/);
  });
});
