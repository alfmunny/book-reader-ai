/**
 * Regression test for #1935:
 * Reader sidebar notes tab and vocab tab empty states must include
 * a font-serif headline per the design system empty-state rule.
 */
import { readFileSync } from "fs";
import { join } from "path";

const src = readFileSync(
  join(__dirname, "../app/reader/[bookId]/page.tsx"),
  "utf8",
);

// Notes tab: capture from filteredNotes.length === 0 through the sub-text
const notesEmptyBlock =
  src.match(/filteredNotes\.length === 0[\s\S]{0,600}Long-press/)?.[0] ?? "";

// Vocab tab: capture from filteredVocab.length === 0 through the sub-text
const vocabEmptyBlock =
  src.match(/filteredVocab\.length === 0[\s\S]{0,600}Select text/)?.[0] ?? "";

describe("Reader sidebar notes-tab empty state (closes #1935)", () => {
  it("notes empty block is found in source", () => {
    expect(notesEmptyBlock.length).toBeGreaterThan(0);
  });

  it("notes empty state has a font-serif headline", () => {
    expect(notesEmptyBlock).toMatch(/font-serif/);
  });

  it("notes empty state has NoteIcon", () => {
    expect(notesEmptyBlock).toMatch(/NoteIcon/);
  });
});

describe("Reader sidebar vocab-tab empty state (closes #1935)", () => {
  it("vocab empty block is found in source", () => {
    expect(vocabEmptyBlock.length).toBeGreaterThan(0);
  });

  it("vocab empty state has a font-serif headline", () => {
    expect(vocabEmptyBlock).toMatch(/font-serif/);
  });

  it("vocab empty state has EmptyVocabIcon", () => {
    expect(vocabEmptyBlock).toMatch(/EmptyVocabIcon/);
  });
});
