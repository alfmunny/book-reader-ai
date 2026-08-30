/**
 * Regression for #1846 — import page success and stage messages must have
 * live region roles so screen readers announce completion (WCAG 4.1.3).
 */
import { readFileSync } from "fs";
import { join } from "path";

const src = readFileSync(
  join(__dirname, "../app/(shell)/import/[bookId]/page.tsx"),
  "utf-8"
);

describe("Import page status messages (closes #1846)", () => {
  it('isDone success message has role="status"', () => {
    const idx = src.indexOf("Done — opening your book");
    expect(idx).toBeGreaterThan(-1);
    const window = src.slice(Math.max(0, idx - 200), idx + 50);
    expect(window).toContain('role="status"');
  });
});
