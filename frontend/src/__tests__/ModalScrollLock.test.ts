/**
 * Regression tests for #2354: AddWordPicker (decks) and vocabulary word
 * detail drawer were missing useScrollLock — body remained scrollable
 * behind the modal while it was open.
 */
import * as fs from "fs";
import * as path from "path";

const decksSrc = fs.readFileSync(
  path.join(__dirname, "../app/(shell)/decks/[deckId]/page.tsx"),
  "utf8",
);
const vocabSrc = fs.readFileSync(
  path.join(__dirname, "../app/(shell)/vocabulary/page.tsx"),
  "utf8",
);

describe("AddWordPicker scroll lock (closes #2354)", () => {
  it("imports useScrollLock", () => {
    expect(decksSrc).toContain("useScrollLock");
  });

  it("calls useScrollLock inside AddWordPicker", () => {
    const pickerStart = decksSrc.indexOf("function AddWordPicker(");
    expect(pickerStart).toBeGreaterThan(-1);
    const pickerBody = decksSrc.slice(pickerStart, pickerStart + 1000);
    expect(pickerBody).toContain("useScrollLock(");
  });
});

describe("Vocabulary word detail drawer scroll lock (closes #2354)", () => {
  it("imports useScrollLock", () => {
    expect(vocabSrc).toContain("useScrollLock");
  });

  it("calls useScrollLock in the word detail component", () => {
    // The component that renders the bottom sheet drawer
    expect(vocabSrc).toMatch(/useScrollLock\(true\)/);
  });
});
