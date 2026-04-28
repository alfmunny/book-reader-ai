/**
 * Regression for #1858 — admin books search result count must be announced
 * to screen readers via aria-live or role="status" (WCAG 4.1.3).
 */
import { readFileSync } from "fs";
import { join } from "path";

const src = readFileSync(
  join(__dirname, "../app/admin/books/page.tsx"),
  "utf-8"
);

describe("Admin books search live region (closes #1858)", () => {
  it("result count span has role=status or aria-live", () => {
    // The visible count (e.g. "5 / 10") when searching must be in a live region
    const countIdx = src.indexOf("books.length");
    expect(countIdx).toBeGreaterThan(-1);
    const window = src.slice(Math.max(0, countIdx - 500), countIdx + 200);
    expect(window).toMatch(/aria-live|role="status"/);
  });

  it("search input has aria-label", () => {
    expect(src).toContain('aria-label="Filter books"');
  });
});
