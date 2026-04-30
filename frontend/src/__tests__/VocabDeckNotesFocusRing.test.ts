import fs from "fs";
import path from "path";

const vocabPage = fs.readFileSync(
  path.resolve(__dirname, "../app/vocabulary/page.tsx"),
  "utf8",
);
const deckDetailPage = fs.readFileSync(
  path.resolve(__dirname, "../app/decks/[deckId]/page.tsx"),
  "utf8",
);
const notesBookPage = fs.readFileSync(
  path.resolve(__dirname, "../app/notes/[bookId]/page.tsx"),
  "utf8",
);
const deckCard = fs.readFileSync(
  path.resolve(__dirname, "../components/DeckCard.tsx"),
  "utf8",
);
const undoToast = fs.readFileSync(
  path.resolve(__dirname, "../components/UndoToast.tsx"),
  "utf8",
);

describe("vocabulary page button focus rings (closes #2174)", () => {
  it("Library back button has focus-visible:ring-2", () => {
    // Library back button is now a <Link href="/"> — match on href near focus-visible:ring-2
    expect(vocabPage).toMatch(/href="\/"\s*[\s\S]{0,300}?focus-visible:ring-2|focus-visible:ring-2[\s\S]{0,300}?href="\//);
  });

  it("Flashcards button has focus-visible:ring-2", () => {
    expect(vocabPage).toMatch(/flashcards[\s\S]{0,300}?focus-visible:ring-2|focus-visible:ring-2[\s\S]{0,300}?flashcards/i);
  });

  it("close definition button has focus-visible:ring-2", () => {
    expect(vocabPage).toMatch(/Close definition[\s\S]{0,300}?focus-visible:ring-2|focus-visible:ring-2[\s\S]{0,300}?Close definition/);
  });

  it("vocabulary page has at least 5 focus-visible:ring-2 instances", () => {
    const matches = vocabPage.match(/focus-visible:ring-2/g) ?? [];
    expect(matches.length).toBeGreaterThanOrEqual(5);
  });
});

describe("decks/[deckId] page button focus rings (closes #2174)", () => {
  it("Decks back button has focus-visible:ring-2", () => {
    // Decks back button is now a <Link href="/decks"> — match on href near focus-visible:ring-2
    expect(deckDetailPage).toMatch(/href="\/decks"[\s\S]{0,300}?focus-visible:ring-2|focus-visible:ring-2[\s\S]{0,300}?href="\/decks"/);
  });

  it("deck detail page has at least 4 focus-visible:ring-2 instances", () => {
    const matches = deckDetailPage.match(/focus-visible:ring-2/g) ?? [];
    expect(matches.length).toBeGreaterThanOrEqual(4);
  });
});

describe("notes/[bookId] page button focus rings (closes #2174)", () => {
  it("notes book page has at least 4 focus-visible:ring-2 instances", () => {
    const matches = notesBookPage.match(/focus-visible:ring-2/g) ?? [];
    expect(matches.length).toBeGreaterThanOrEqual(4);
  });
});

describe("DeckCard component button focus rings (closes #2174)", () => {
  it("open deck button has focus-visible:ring-2", () => {
    expect(deckCard).toMatch(/Open deck[\s\S]{0,300}?focus-visible:ring-2|focus-visible:ring-2[\s\S]{0,300}?Open deck/);
  });

  it("delete deck button has focus-visible:ring-2", () => {
    expect(deckCard).toMatch(/Delete deck[\s\S]{0,300}?focus-visible:ring-2|focus-visible:ring-2[\s\S]{0,300}?Delete deck/);
  });
});

describe("UndoToast component button focus rings (closes #2174)", () => {
  it("Undo button has focus-visible:ring-2", () => {
    expect(undoToast).toMatch(/handleUndo[\s\S]{0,300}?focus-visible:ring-2|focus-visible:ring-2[\s\S]{0,300}?handleUndo/);
  });
});
