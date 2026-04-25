/**
 * Regression test for #1279 — vocabulary sort-mode buttons must carry aria-pressed.
 * Uses static source analysis (no component mount needed).
 */
import * as fs from "fs";
import * as path from "path";

const src = fs.readFileSync(
  path.resolve(__dirname, "../app/vocabulary/page.tsx"),
  "utf8"
);

describe("Vocabulary sort-mode buttons have aria-pressed (closes #1279)", () => {
  it("aria-pressed is bound dynamically on sort buttons", () => {
    expect(src).toContain('aria-pressed={sortMode === value}');
  });
});
