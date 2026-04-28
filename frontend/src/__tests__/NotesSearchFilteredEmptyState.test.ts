/**
 * Regression tests for #1925 and #1927:
 * Notes overview page search-filtered empty state must include an SVG icon,
 * a font-serif headline, and a clear-search CTA button.
 */
import { readFileSync } from "fs";
import { join } from "path";

const src = readFileSync(
  join(__dirname, "../app/notes/page.tsx"),
  "utf8",
);

/**
 * Capture the entire filtered.length === 0 block (icon + inner branches)
 * through the clear-search CTA. This is wide enough to include the
 * EmptyNotesIcon placed outside the books.length === 0 sub-conditional.
 */
const filteredEmptyBlock =
  src.match(/filtered\.length === 0[\s\S]{0,2000}Clear search/)?.[0] ?? "";

/**
 * Anchor on the search-filter sub-case: when books exist but filtered is empty.
 * Captures just the else branch (font-serif headline + clear CTA).
 */
const searchEmptyBlock =
  src.match(/books\.length === 0[\s\S]{0,1600}Clear search/)?.[0] ?? "";

describe("Notes search-filtered empty state (closes #1925, #1927)", () => {
  it("search-filter empty block is found in source", () => {
    expect(searchEmptyBlock.length).toBeGreaterThan(0);
  });

  it("search-filter empty state has a font-serif headline", () => {
    expect(searchEmptyBlock).toMatch(/font-serif/);
  });

  it("search-filter empty state has a clear-search button calling setSearch", () => {
    expect(searchEmptyBlock).toMatch(/setSearch\(""\)/);
  });

  it("filtered empty state outer block includes EmptyNotesIcon (closes #1927)", () => {
    expect(filteredEmptyBlock).toMatch(/EmptyNotesIcon/);
  });
});
