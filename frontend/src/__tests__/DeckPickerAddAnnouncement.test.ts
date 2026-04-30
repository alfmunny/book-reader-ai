/**
 * Regression test for issue #2398: AddWordPicker in the deck detail page
 * did not announce word additions to screen readers (WCAG 4.1.3).
 */
import fs from "fs";
import path from "path";

function read(rel: string): string {
  return fs.readFileSync(path.join(process.cwd(), rel), "utf8");
}

describe("DeckDetailPage AddWordPicker — aria-live announcement on add (issue #2398)", () => {
  const src = read("src/app/decks/[deckId]/page.tsx");

  // Find the AddWordPicker function body (from its declaration to the next top-level function).
  const pickerStart = src.indexOf("function AddWordPicker");
  const afterPicker = src.indexOf("\nfunction ", pickerStart + 1);
  const picker = afterPicker > 0 ? src.slice(pickerStart, afterPicker) : src.slice(pickerStart);

  it("AddWordPicker tracks the last added word in state", () => {
    // Must maintain local state for the last-added word name so it can populate the live region.
    expect(picker).toMatch(/useState.*lastAdded|lastAdded.*useState|setLastAdded/);
  });

  it("AddWordPicker contains a role=status aria-live=polite region", () => {
    expect(picker).toMatch(/role="status"/);
    expect(picker).toMatch(/aria-live="polite"/);
  });

  it("live region text references the last added word", () => {
    // The announcement should contain the word text, not just a generic message.
    expect(picker).toMatch(/lastAdded/);
  });
});
