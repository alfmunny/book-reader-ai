/**
 * Regression test for #1925:
 * Notes overview page search-filtered empty state must include a font-serif
 * headline and a clear-search CTA button — not just a bare <p>.
 */
import { readFileSync } from "fs";
import { join } from "path";

const src = readFileSync(
  join(__dirname, "../app/notes/page.tsx"),
  "utf8",
);

/**
 * Anchor on the search-filter sub-case: when books exist but filtered is empty.
 * We capture from "books.length === 0" negation context up to the closing
 * of that branch (the else case).
 */
const searchEmptyBlock =
  src.match(/books\.length === 0[\s\S]{0,1600}Clear search/)?.[0] ?? "";

describe("Notes search-filtered empty state (closes #1925)", () => {
  it("search-filter empty block is found in source", () => {
    expect(searchEmptyBlock.length).toBeGreaterThan(0);
  });

  it("search-filter empty state has a font-serif headline", () => {
    expect(searchEmptyBlock).toMatch(/font-serif/);
  });

  it("search-filter empty state has a clear-search button calling setSearch", () => {
    expect(searchEmptyBlock).toMatch(/setSearch\(""\)/);
  });
});
