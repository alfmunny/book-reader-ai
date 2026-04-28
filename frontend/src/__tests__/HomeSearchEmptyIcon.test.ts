/**
 * Regression test for #1937:
 * Home page Gutenberg search empty state must include a SearchIcon
 * per the design system empty-state rule (icon + font-serif + sub-text).
 */
import { readFileSync } from "fs";
import { join } from "path";

const src = readFileSync(join(__dirname, "../app/page.tsx"), "utf8");

// Capture the Gutenberg search no-results block through the sub-text hint.
const noResultsBlock =
  src.match(/searchedQuery && searchResults\.length === 0[\s\S]{0,600}language filter/)?.[0] ?? "";

describe("Home page Gutenberg search empty state (closes #1937)", () => {
  it("no-results block is found in source", () => {
    expect(noResultsBlock.length).toBeGreaterThan(0);
  });

  it("no-results empty state includes SearchIcon", () => {
    expect(noResultsBlock).toMatch(/SearchIcon/);
  });

  it("SearchIcon has aria-hidden for decorative use", () => {
    expect(noResultsBlock).toMatch(/aria-hidden/);
  });
});
