/**
 * Regression test for #1884: icon-only "View on Project Gutenberg" link in the
 * reader header must have aria-label (WCAG 4.1.2 — Name, Role, Value).
 *
 * The link icon has aria-hidden="true", so title= alone is unreliable across
 * AT/browser combinations. aria-label is the correct mechanism.
 */
import * as fs from "fs";
import * as path from "path";

const src = fs.readFileSync(
  path.join(__dirname, "../app/reader/[bookId]/page.tsx"),
  "utf8"
);

describe("Reader Gutenberg link accessible name (closes #1884)", () => {
  it("Gutenberg external link has aria-label (not title only)", () => {
    const idx = src.indexOf("View on Project Gutenberg");
    expect(idx).toBeGreaterThan(-1);
    // Grab context around the first occurrence (the <a> tag)
    const region = src.slice(Math.max(0, idx - 300), idx + 100);
    expect(region).toContain('aria-label');
  });

  it("aria-label contains 'Gutenberg' text for clear announcement", () => {
    const idx = src.indexOf("View on Project Gutenberg");
    const region = src.slice(Math.max(0, idx - 300), idx + 100);
    expect(region).toMatch(/aria-label="[^"]*[Gg]utenberg/);
  });
});
