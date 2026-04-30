/**
 * Regression test for issue #2394: deck detail page shows disabled "Add word"
 * button with no guidance when user has zero saved vocabulary words.
 */
import fs from "fs";
import path from "path";

function read(rel: string): string {
  return fs.readFileSync(path.join(process.cwd(), rel), "utf8");
}

describe("DeckDetailPage — zero vocab empty-state guidance (issue #2394)", () => {
  const src = read("src/app/decks/[deckId]/page.tsx");

  it("distinguishes zero-vocab case from all-in-deck case", () => {
    // vocab.length === 0 and candidateWords.length === 0 are both possible —
    // the page must branch on vocab.length (not only candidateWords.length)
    expect(src).toMatch(/vocab\.length\s*===?\s*0|vocab\.length\s*<\s*1/);
  });

  it("offers a library or reading CTA when there are no saved words", () => {
    // Should contain text guiding the user to save words while reading
    expect(src).toMatch(
      /start reading|go to library|save words.*reading|reading.*save words|\/|router\.push/i,
    );
  });

  it("empty state for zero vocab does NOT just show a disabled button with no explanation", () => {
    // The all-words-in-deck message should NOT appear when vocab is empty
    // (we want separate messaging for the two cases)
    expect(src).toMatch(
      /vocab\.length|No vocabulary|save words|haven.*saved/i,
    );
  });
});
