/**
 * Regression test for issue #799 — vocabulary Flashcards button is icon-only
 * on mobile (< sm) with no aria-label.
 */
import fs from "fs";
import path from "path";

const src = fs.readFileSync(
  path.join(__dirname, "../app/vocabulary/page.tsx"),
  "utf-8"
);

describe("Vocabulary Flashcards button a11y (#799)", () => {
  it("flashcards-btn has aria-label", () => {
    const idx = src.indexOf("flashcards-btn");
    const snippet = src.slice(Math.max(0, idx - 400), idx + 50);
    expect(snippet).toMatch(/aria-label="Flashcards"/);
  });

  it("vocabulary page source includes aria-label Flashcards", () => {
    expect(src).toMatch(/aria-label="Flashcards"/);
  });
});
