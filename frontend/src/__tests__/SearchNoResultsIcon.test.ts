/**
 * Regression test for #1928:
 * The search page no-results empty state must include a SearchIcon SVG
 * before the headline — matching the design-system rule (icon + headline + sub-text + CTA).
 */
import { readFileSync } from "fs";
import { join } from "path";

const src = readFileSync(
  join(__dirname, "../app/(shell)/search/page.tsx"),
  "utf8",
);

/**
 * Capture the no-results block anchored on total === 0 check,
 * up through the CTA link.
 */
const noResultsBlock =
  src.match(/total === 0[\s\S]{0,1000}Browse books/)?.[0] ?? "";

describe("Search no-results empty state (closes #1928)", () => {
  it("no-results block is found in source", () => {
    expect(noResultsBlock.length).toBeGreaterThan(0);
  });

  it("no-results empty state includes SearchIcon", () => {
    expect(noResultsBlock).toMatch(/SearchIcon/);
  });

  it("no-results empty state has aria-hidden on the icon", () => {
    expect(noResultsBlock).toMatch(/aria-hidden="true"/);
  });
});
