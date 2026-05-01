/**
 * Regression test for #2605:
 * decks/page.tsx, decks/[deckId]/page.tsx, and notes/[bookId]/page.tsx
 * had the same silent .catch(() => {}) pattern as vocabulary (fixed in #2603).
 *
 * All commit paths in optimistic-delete/UndoToast flows must NOT silently
 * swallow backend errors.
 */
import * as fs from "fs";
import * as path from "path";

const srcDir = path.join(__dirname, "..");

const decksPage = fs.readFileSync(
  path.join(srcDir, "app/decks/page.tsx"),
  "utf8",
);
const deckDetailPage = fs.readFileSync(
  path.join(srcDir, "app/decks/[deckId]/page.tsx"),
  "utf8",
);
const notesPage = fs.readFileSync(
  path.join(srcDir, "app/notes/[bookId]/page.tsx"),
  "utf8",
);

const BARE_CATCH = /\.catch\(\(\)\s*=>\s*\{\s*\}\)/;

describe("decks/page.tsx — deck deletion error handling", () => {
  it("handleDelete commit path does not bare-swallow errors", () => {
    // Scan the handleDelete callback for the silent catch
    const idx = decksPage.indexOf("handleDelete");
    expect(idx).not.toBe(-1);
    const block = decksPage.slice(idx, idx + 400);
    expect(block).not.toMatch(BARE_CATCH);
  });

  it("UndoToast onDone for deck deletion does not bare-swallow errors", () => {
    const undoIdx = decksPage.indexOf("<UndoToast");
    expect(undoIdx).not.toBe(-1);
    const block = decksPage.slice(undoIdx, undoIdx + 400);
    expect(block).not.toMatch(BARE_CATCH);
  });
});

describe("decks/[deckId]/page.tsx — deck member removal error handling", () => {
  it("handleRemove commit path does not bare-swallow errors", () => {
    const idx = deckDetailPage.indexOf("handleRemove");
    expect(idx).not.toBe(-1);
    const block = deckDetailPage.slice(idx, idx + 500);
    expect(block).not.toMatch(BARE_CATCH);
  });

  it("UndoToast onDone for member removal does not bare-swallow errors", () => {
    const undoIdx = deckDetailPage.indexOf("<UndoToast");
    expect(undoIdx).not.toBe(-1);
    const block = deckDetailPage.slice(undoIdx, undoIdx + 400);
    expect(block).not.toMatch(BARE_CATCH);
  });
});

describe("notes/[bookId]/page.tsx — annotation and insight deletion error handling", () => {
  it("handleDeleteAnnotation commit path does not bare-swallow errors", () => {
    const idx = notesPage.indexOf("handleDeleteAnnotation");
    expect(idx).not.toBe(-1);
    const block = notesPage.slice(idx, idx + 400);
    expect(block).not.toMatch(BARE_CATCH);
  });

  it("handleDeleteInsight commit path does not bare-swallow errors", () => {
    const idx = notesPage.indexOf("handleDeleteInsight");
    expect(idx).not.toBe(-1);
    const block = notesPage.slice(idx, idx + 400);
    expect(block).not.toMatch(BARE_CATCH);
  });

  it("UndoToast onDone for annotation deletion does not bare-swallow errors", () => {
    const annUndoIdx = notesPage.indexOf("Annotation deleted");
    expect(annUndoIdx).not.toBe(-1);
    const block = notesPage.slice(annUndoIdx, annUndoIdx + 400);
    expect(block).not.toMatch(BARE_CATCH);
  });

  it("UndoToast onDone for insight deletion does not bare-swallow errors", () => {
    const insUndoIdx = notesPage.indexOf("Insight deleted");
    expect(insUndoIdx).not.toBe(-1);
    const block = notesPage.slice(insUndoIdx, insUndoIdx + 400);
    expect(block).not.toMatch(BARE_CATCH);
  });
});
