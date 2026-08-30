/**
 * Regression test for #1923:
 * Vocabulary filtered empty states (tag filter + search filter) must include
 * an icon, a headline, and a clear-filter CTA button — not just a bare <p>.
 */
import { readFileSync } from "fs";
import { join } from "path";

const src = readFileSync(
  join(__dirname, "../app/(shell)/vocabulary/page.tsx"),
  "utf8",
);

/**
 * Extract the JSX block that handles `filtered.length === 0` by anchoring to
 * the condition and capturing up to the opening of the items section.
 */
const filteredEmptyBlock =
  src.match(/filtered\.length === 0[\s\S]{0,3500}space-y-8/)?.[0] ?? "";

describe("Vocabulary filtered empty state (closes #1923)", () => {
  it("filtered empty block is found in source", () => {
    expect(filteredEmptyBlock.length).toBeGreaterThan(0);
  });

  it("tag-filter empty state includes EmptyVocabIcon", () => {
    expect(filteredEmptyBlock).toMatch(/EmptyVocabIcon/);
  });

  it("tag-filter empty state has a clear-filter button", () => {
    // The button calls setSelectedTag(null) or setSearch("") to reset filters
    expect(filteredEmptyBlock).toMatch(
      /setSelectedTag\(null\)|setSearch\(""\)/,
    );
  });

  it("tag-filter empty state has a font-serif headline", () => {
    expect(filteredEmptyBlock).toMatch(/font-serif/);
  });
});
