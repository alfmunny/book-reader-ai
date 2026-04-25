/**
 * Static assertion: /decks/[deckId] read-only detail page exists with
 * required structure (main landmark, role=status loading, role=alert error,
 * back-to-decks navigation).
 * Closes #1154
 */
import fs from "fs";
import path from "path";

function read(rel: string): string {
  return fs.readFileSync(path.join(process.cwd(), rel), "utf8");
}

describe("Deck detail page (read-only)", () => {
  const src = read("src/app/decks/[deckId]/page.tsx");

  it("uses <main id=main-content>", () => {
    expect(src).toContain('id="main-content"');
    expect(src).toMatch(/<main\b/);
  });

  it("calls getDeck for the deck and getVocabulary to resolve member words", () => {
    expect(src).toMatch(/getDeck\s*\(/);
    expect(src).toMatch(/getVocabulary\s*\(/);
  });

  it("loading state uses role=status", () => {
    expect(src).toMatch(/role=["']status["']/);
  });

  it("error state uses role=alert", () => {
    expect(src).toMatch(/role=["']alert["']/);
  });

  it("provides a back link to /decks", () => {
    expect(src).toContain("/decks");
    expect(src).toMatch(/ArrowLeftIcon/);
  });

  it("renders empty state with CTA back to /decks when deck has no members", () => {
    expect(src).toMatch(/No words in this deck yet/i);
  });

  it("sets the document title", () => {
    expect(src).toMatch(/document\.title\s*=/);
  });
});
