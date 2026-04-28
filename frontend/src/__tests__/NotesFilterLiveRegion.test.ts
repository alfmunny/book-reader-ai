/**
 * Regression for #1852 — notes page book filter must announce result count via
 * sr-only aria-live region so screen readers know when filtering changes the
 * book list (WCAG 4.1.3).
 */
import { readFileSync } from "fs";
import { join } from "path";

const src = readFileSync(
  join(__dirname, "../app/notes/page.tsx"),
  "utf-8"
);

describe("Notes page filter live region (closes #1852)", () => {
  it("has an sr-only aria-live status region for filter result announcements", () => {
    expect(src).toContain("sr-only");
    const srIdx = src.indexOf("sr-only");
    const window = src.slice(Math.max(0, srIdx - 300), srIdx + 300);
    expect(window).toContain("aria-live");
  });

  it("filter announcement references filtered book count", () => {
    const srIdx = src.indexOf("sr-only");
    expect(srIdx).toBeGreaterThan(-1);
    const window = src.slice(Math.max(0, srIdx - 400), srIdx + 400);
    expect(window).toMatch(/filtered\.length|filterCount|bookCount/);
  });
});
