/**
 * Static assertion: /profile surfaces a "Study decks" section listing
 * decks with due_today > 0, with rows that pre-select the deck via the
 * flashcards.lastDeckId localStorage key (#1199) before navigating.
 * Closes #1201
 */
import fs from "fs";
import path from "path";

function read(rel: string): string {
  return fs.readFileSync(path.join(process.cwd(), rel), "utf8");
}

describe("Profile decks-due-today panel", () => {
  const src = read("src/app/profile/page.tsx");

  it("imports listDecks and DeckSummary", () => {
    expect(src).toMatch(/listDecks/);
    expect(src).toMatch(/DeckSummary/);
  });

  it("filters to decks with due_today > 0", () => {
    expect(src).toMatch(/due_today\s*>\s*0/);
  });

  it("renders a Study decks heading", () => {
    expect(src).toMatch(/Study decks/);
  });

  it("each row has aria-label describing the action", () => {
    expect(src).toMatch(/aria-label=\{[^}]*Review\b/);
  });

  it("row navigates to /vocabulary/flashcards after persisting lastDeckId", () => {
    expect(src).toMatch(/flashcards\.lastDeckId/);
    expect(src).toMatch(/router\.push\(\s*["']\/vocabulary\/flashcards["']/);
  });

  it("row meets 44px touch target", () => {
    const idx = src.indexOf(">Study decks<");
    expect(idx).toBeGreaterThan(0);
    const window = src.slice(idx, idx + 1500);
    expect(window).toMatch(/min-h-\[44px\]/);
  });

  it("loading state on the panel uses role=status with aria-label", () => {
    // Loading skeleton must use role=status; appears in the decksLoading branch
    expect(src).toMatch(/role=["']status["']\s+aria-label=["']Loading study decks["']/);
  });
});
