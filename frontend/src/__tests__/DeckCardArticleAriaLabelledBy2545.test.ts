/**
 * Regression tests for #2545:
 * DeckCard <article> elements must have aria-labelledby referencing the deck
 * name heading so screen readers can identify individual cards when navigating
 * by article landmark.
 */
import fs from "fs";
import path from "path";

const src = fs.readFileSync(
  path.resolve(__dirname, "..", "components/DeckCard.tsx"),
  "utf-8"
);

describe("DeckCard article has aria-labelledby (closes #2545)", () => {
  it("article element has aria-labelledby attribute", () => {
    expect(src).toContain("aria-labelledby=");
  });

  it("aria-labelledby references a deck-name id", () => {
    expect(src).toMatch(/aria-labelledby=\{[^}]*deck-name/);
  });

  it("h2 has matching id attribute keyed by deck.id", () => {
    expect(src).toMatch(/id=\{[^}]*deck-name[^}]*deck\.id/);
  });
});
