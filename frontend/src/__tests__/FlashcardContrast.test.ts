/**
 * Regression test for #1342: flashcards page WCAG 1.4.3 contrast failures.
 * White on amber-500 (2.09:1) and stone-400 on white (2.45:1) both fail AA.
 */
import * as fs from "fs";
import * as path from "path";

const src = fs.readFileSync(
  path.join(__dirname, "../app/vocabulary/flashcards/page.tsx"),
  "utf8",
);

describe("Flashcard page contrast (closes #1342)", () => {
  it("Show Answer button does not use bg-amber-500 (2.09:1 contrast fail)", () => {
    // bg-amber-500 with text-white fails WCAG AA (white on amber-500 = ~2.09:1)
    expect(src).not.toContain("bg-amber-500 text-white");
  });

  it("Show Answer button uses bg-amber-700 (5.07:1 contrast pass)", () => {
    expect(src).toContain("bg-amber-700");
  });

  it("card type labels and counters do not use text-stone-400 (2.45:1 contrast fail)", () => {
    // No text-xs text-stone-400 used for informational card text
    expect(src).not.toMatch(/text-xs text-stone-400/);
  });
});
