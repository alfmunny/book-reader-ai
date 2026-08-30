/**
 * Regression tests for #2191: focus-visible rings on vocabulary, notes,
 * and flashcard page interactive buttons.
 */
import * as fs from "fs";
import * as path from "path";

const vocabPage = fs.readFileSync(
  path.join(__dirname, "../app/(shell)/vocabulary/page.tsx"),
  "utf8"
);
const notesBookPage = fs.readFileSync(
  path.join(__dirname, "../app/(shell)/notes/[bookId]/page.tsx"),
  "utf8"
);
const flashcardsPage = fs.readFileSync(
  path.join(__dirname, "../app/vocabulary/flashcards/page.tsx"),
  "utf8"
);

describe("Vocabulary page focus rings (closes #2191)", () => {
  it("Sort mode buttons (inside overflow-hidden container) have focus ring with ring-inset", () => {
    const idx = vocabPage.indexOf('sort-mode-control"');
    expect(idx).toBeGreaterThan(-1);
    const window = vocabPage.slice(idx, idx + 500);
    expect(window).toContain("focus-visible:ring-amber-400");
    expect(window).toContain("focus-visible:ring-inset");
  });

  it("Tag filter buttons have focus ring", () => {
    // data-testid="tag-filter-all" is the stable anchor; className comes before it
    const idx = vocabPage.indexOf('data-testid="tag-filter-all"');
    expect(idx).toBeGreaterThan(-1);
    const window = vocabPage.slice(Math.max(0, idx - 150), idx + 300);
    expect(window).toContain("focus-visible:ring-amber-400");
  });
});

describe("Notes book page focus rings (closes #2191)", () => {
  it("Delete insight button has red focus ring (destructive action)", () => {
    const idx = notesBookPage.indexOf('"Delete insight"');
    expect(idx).toBeGreaterThan(-1);
    const window = notesBookPage.slice(Math.max(0, idx - 300), idx + 50);
    expect(window).toContain("focus-visible:ring-red-400");
  });
});

describe("Flashcards page focus rings (closes #2191)", () => {
  it("Retry button (amber-700 bg) has focus ring with amber-700 offset", () => {
    // Use onClick=loadData as anchor (unique to this button)
    const idx = flashcardsPage.indexOf("onClick={loadData}");
    expect(idx).toBeGreaterThan(-1);
    const window = flashcardsPage.slice(idx, idx + 360);
    expect(window).toContain("focus-visible:ring-amber-400");
    expect(window).toContain("ring-offset-amber-700");
  });
});
