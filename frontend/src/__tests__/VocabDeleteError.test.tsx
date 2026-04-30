/**
 * Regression tests for vocabulary word deletion UX.
 *
 * Issue #2374: vocabulary delete now uses optimistic UndoToast (matching home,
 * notes, and decks pages) instead of a synchronous API call + error banner.
 *
 * Tests verify the source-level invariants that enforce this pattern.
 */
import * as fs from "fs";
import * as path from "path";

const src = fs.readFileSync(
  path.join(__dirname, "../app/vocabulary/page.tsx"),
  "utf8",
);

test("vocabulary page imports UndoToast", () => {
  expect(src).toMatch(/import UndoToast from "@\/components\/UndoToast"/);
});

test("handleDelete is synchronous (no async/await — delete is deferred to onDone)", () => {
  const idx = src.indexOf("function handleDelete(");
  expect(idx).toBeGreaterThan(-1);
  // Must NOT be declared as async
  const prefix = src.slice(Math.max(0, idx - 10), idx + 30);
  expect(prefix).not.toMatch(/async\s+function handleDelete/);
});

test("handleDelete stores deleted form in deletedWordToast state", () => {
  const idx = src.indexOf("function handleDelete(");
  expect(idx).toBeGreaterThan(-1);
  const fnSrc = src.slice(idx, idx + 400);
  expect(fnSrc).toMatch(/setDeletedWordToast\(/);
  // Must optimistically remove the word from list
  expect(fnSrc).toMatch(/setWords\(/);
});

test("vocabulary page renders UndoToast when deletedWordToast is set", () => {
  expect(src).toMatch(/deletedWordToast\s*&&/);
  expect(src).toMatch(/<UndoToast/);
});

test("UndoToast onDone calls deleteVocabularyWord", () => {
  const undoIdx = src.indexOf("<UndoToast");
  expect(undoIdx).toBeGreaterThan(-1);
  const block = src.slice(undoIdx, undoIdx + 500);
  expect(block).toMatch(/onDone/);
  expect(block).toMatch(/deleteVocabularyWord/);
});
