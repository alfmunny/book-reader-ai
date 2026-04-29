/**
 * Static assertions: VocabRow word link carries lang attribute — WCAG 3.1.2
 * Closes #2291
 */
import fs from "fs";
import path from "path";

const src = fs.readFileSync(
  path.join(process.cwd(), "src/app/notes/[bookId]/page.tsx"),
  "utf8",
);

describe("NotesVocabRowLang", () => {
  it("VocabRow component exists in source", () => {
    expect(src).toContain("function VocabRow(");
  });

  it("VocabRow word anchor carries lang attribute", () => {
    const anchor = src.indexOf("function VocabRow(");
    expect(anchor).toBeGreaterThan(0);
    // The <a> tag for the word should have lang before the closing > of the opening tag
    const block = src.slice(anchor, anchor + 750);
    expect(block).toMatch(/lang=\{bookLanguage/);
  });

  it("VocabRow word anchor lang uses null-coalescing pattern", () => {
    const anchor = src.indexOf("function VocabRow(");
    const block = src.slice(anchor, anchor + 750);
    expect(block).toMatch(/lang=\{bookLanguage\s*\?\?\s*undefined\}/);
  });
});
