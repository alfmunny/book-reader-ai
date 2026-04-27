/**
 * Regression test for issue #1798:
 * Flashcard answer side was blank — context sentence not shown on flip.
 * Fixed by rendering currentCard.context in the flipped card body.
 */
import * as fs from "fs";
import * as path from "path";

const pageSrc = fs.readFileSync(
  path.join(__dirname, "../app/vocabulary/flashcards/page.tsx"),
  "utf8",
);

const apiSrc = fs.readFileSync(
  path.join(__dirname, "../lib/api.ts"),
  "utf8",
);

describe("Flashcard context sentence (closes #1798)", () => {
  it("Flashcard interface in api.ts includes context field", () => {
    expect(apiSrc).toMatch(/interface Flashcard[\s\S]{0,200}context\??\s*:\s*string/);
  });

  it("flashcards page renders currentCard.context when flipped", () => {
    expect(pageSrc).toMatch(/currentCard\.context/);
  });

  it("flipped card content region has aria-live for screen reader announcement", () => {
    expect(pageSrc).toMatch(/aria-live/);
  });
});
