/**
 * Regression test for #1347: decks and notes pages WCAG 1.4.3 contrast failures.
 * text-stone-400 on white = 2.65:1 — fails AA. text-stone-500 = 4.86:1 — passes.
 */
import * as fs from "fs";
import * as path from "path";

const decksPage = fs.readFileSync(
  path.join(__dirname, "../app/decks/page.tsx"),
  "utf8",
);
const deckDetailPage = fs.readFileSync(
  path.join(__dirname, "../app/decks/[deckId]/page.tsx"),
  "utf8",
);
const notesPage = fs.readFileSync(
  path.join(__dirname, "../app/notes/page.tsx"),
  "utf8",
);
const notesDetailPage = fs.readFileSync(
  path.join(__dirname, "../app/notes/[bookId]/page.tsx"),
  "utf8",
);

describe("Decks and notes pages contrast (closes #1347)", () => {
  it("decks/page.tsx has no text-xs text-stone-400 (2.65:1 fail)", () => {
    expect(decksPage).not.toMatch(/text-xs[^"]*text-stone-400|text-stone-400[^"]*text-xs/);
  });

  it("decks/page.tsx has no text-sm text-stone-400 (2.65:1 fail)", () => {
    expect(decksPage).not.toMatch(/text-sm[^"]*text-stone-400|text-stone-400[^"]*text-sm/);
  });

  it("decks/[deckId]/page.tsx has no text-xs text-stone-400 (2.65:1 fail)", () => {
    expect(deckDetailPage).not.toMatch(/text-xs[^"]*text-stone-400|text-stone-400[^"]*text-xs/);
  });

  it("decks/[deckId]/page.tsx has no text-sm text-stone-400 (2.65:1 fail)", () => {
    // Use word-boundary check to avoid matching placeholder:text-stone-400 in the same className
    expect(deckDetailPage).not.toContain('"text-sm text-stone-400');
    expect(deckDetailPage).not.toContain('"text-stone-400 text-sm');
  });

  it("notes/page.tsx has no text-xs text-stone-400 (2.65:1 fail)", () => {
    expect(notesPage).not.toMatch(/text-xs[^"]*text-stone-400|text-stone-400[^"]*text-xs/);
  });

  it("notes/[bookId]/page.tsx has no text-xs text-stone-400 (2.65:1 fail)", () => {
    expect(notesDetailPage).not.toMatch(/text-xs[^"]*text-stone-400|text-stone-400[^"]*text-xs/);
  });
});
