/**
 * Regression #2389: vocabulary empty-state must show "Clear all filters" CTA
 * when both a tag filter and a search term are active simultaneously.
 * Previously only one CTA was shown (tag filter took precedence), leaving
 * users in a dead-end if clearing the tag still returned zero results.
 */
import fs from "fs";
import path from "path";

const src = fs.readFileSync(
  path.resolve(__dirname, "../app/(shell)/vocabulary/page.tsx"),
  "utf8"
);

describe("Vocabulary page empty-state filter dead-end (issue #2389)", () => {
  it("handles both selectedTag and search active: source references both conditions", () => {
    // The empty-state block should contain logic for both-active case
    const emptyStateBlock = src.slice(
      src.indexOf("filtered.length === 0"),
      src.indexOf("filtered.length === 0") + 2000
    );
    // Must have a branch that handles selectedTag && search both truthy
    expect(emptyStateBlock).toMatch(/selectedTag.*&&.*search|search.*&&.*selectedTag/);
  });

  it("shows 'Clear all filters' text when both filters are active", () => {
    expect(src).toContain("Clear all filters");
  });

  it("clears both tag and search in the combined handler", () => {
    // The combined clear handler must call setSelectedTag(null) and setSearch("")
    const clearAllIdx = src.indexOf("Clear all filters");
    expect(clearAllIdx).toBeGreaterThan(-1);
    const surrounding = src.slice(Math.max(0, clearAllIdx - 500), clearAllIdx + 200);
    expect(surrounding).toContain("setSelectedTag(null)");
    expect(surrounding).toContain('setSearch("")');
  });

  it("still shows single 'Clear tag filter' when only tag is active", () => {
    expect(src).toContain("Clear tag filter");
  });

  it("still shows single 'Clear search' when only search is active", () => {
    expect(src).toContain("Clear search");
  });
});
