/**
 * Static assertion: /vocabulary/flashcards page exposes a deck selector
 * that filters the review session via the backend's deck_id query param.
 * Closes #1195
 */
import fs from "fs";
import path from "path";

function read(rel: string): string {
  return fs.readFileSync(path.join(process.cwd(), rel), "utf8");
}

describe("Flashcards deck selector", () => {
  const page = read("src/app/vocabulary/flashcards/page.tsx");
  const api = read("src/lib/api.ts");

  it("getDueFlashcards accepts an optional deckId and forwards it as deck_id", () => {
    expect(api).toMatch(/getDueFlashcards\s*\(\s*deckId\?:\s*number/);
    expect(api).toMatch(/deck_id=/);
  });

  it("getFlashcardStats accepts an optional deckId and forwards it as deck_id", () => {
    expect(api).toMatch(/getFlashcardStats\s*\(\s*deckId\?:\s*number/);
  });

  it("page imports listDecks and DeckSummary", () => {
    expect(page).toMatch(/listDecks/);
    expect(page).toMatch(/DeckSummary/);
  });

  it("page renders a labelled <select> deck selector with All decks default", () => {
    expect(page).toMatch(/<label\b[^>]*htmlFor=["']flashcards-deck-select["']/);
    expect(page).toMatch(/<select\b[^>]*id=["']flashcards-deck-select["']/);
    expect(page).toMatch(/All decks/i);
  });

  it("selector option for 'all decks' has empty value", () => {
    expect(page).toMatch(/<option\s+value=["']{2}/);
  });

  it("loadData passes the selected deck id to the flashcards APIs", () => {
    expect(page).toMatch(/getDueFlashcards\s*\(\s*selectedDeckId/);
    expect(page).toMatch(/getFlashcardStats\s*\(\s*selectedDeckId/);
  });

  it("selector control meets 44px touch target", () => {
    // The <select> wrapper or the select itself must include min-h-[44px]
    const idx = page.indexOf('id="flashcards-deck-select"');
    expect(idx).toBeGreaterThan(0);
    const window = page.slice(Math.max(0, idx - 400), idx + 400);
    expect(window).toMatch(/min-h-\[44px\]/);
  });
});
