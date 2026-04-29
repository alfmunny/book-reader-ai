/**
 * Static source analysis: VocabularyToast renders word with lang attribute
 * for WCAG 3.1.2 Language of Parts (closes #2281)
 */
import * as fs from "fs";
import * as path from "path";

const toastSrc = fs.readFileSync(
  path.join(__dirname, "../components/VocabularyToast.tsx"),
  "utf8"
);
const readerSrc = fs.readFileSync(
  path.join(__dirname, "../app/reader/[bookId]/page.tsx"),
  "utf8"
);

describe("VocabularyToast WCAG 3.1.2 lang (issue #2281)", () => {
  it("VocabularyToast Props interface includes language", () => {
    const ifaceIdx = toastSrc.indexOf("interface Props");
    expect(ifaceIdx).toBeGreaterThan(-1);
    const block = toastSrc.slice(ifaceIdx, ifaceIdx + 150);
    expect(block).toMatch(/language\??\s*:/);
  });

  it("word in toast has lang attribute", () => {
    // Anchor: unique "saved to vocabulary" text
    const anchor = toastSrc.indexOf("saved to vocabulary");
    expect(anchor).toBeGreaterThan(-1);
    const before = toastSrc.slice(Math.max(0, anchor - 120), anchor);
    expect(before).toMatch(/lang=\{language/);
  });

  it("reader page passes bookLanguage to VocabularyToast", () => {
    const anchor = readerSrc.indexOf("<VocabularyToast");
    expect(anchor).toBeGreaterThan(-1);
    const block = readerSrc.slice(anchor, anchor + 150);
    expect(block).toMatch(/language=\{bookLanguage\}/);
  });
});
