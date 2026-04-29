/**
 * Regression for #2249 — the reader scroll container must carry a lang
 * attribute derived from the book's language so screen readers use correct
 * pronunciation for non-English books (WCAG 3.1.2 Language of Parts).
 */
import { readFileSync } from "fs";
import { join } from "path";

const src = readFileSync(
  join(__dirname, "../app/reader/[bookId]/page.tsx"),
  "utf-8"
);

describe("Reader scroll container lang attribute (closes #2249)", () => {
  it("reader-scroll container has lang attribute from bookLanguage", () => {
    // The id="reader-scroll" container must carry lang={bookLanguage}
    const idx = src.indexOf('id="reader-scroll"');
    expect(idx).toBeGreaterThan(-1);
    const window = src.slice(idx, idx + 300);
    expect(window).toMatch(/lang=\{bookLanguage\}/);
  });
});
