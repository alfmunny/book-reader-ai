import * as fs from "fs";
import * as path from "path";

const src = fs.readFileSync(
  path.join(__dirname, "../app/reader/[bookId]/page.tsx"),
  "utf8"
);

describe("Vocabulary filter word count aria-live (closes #2073)", () => {
  it("word count span has aria-live=\"polite\"", () => {
    expect(src).toContain('aria-live="polite"');
  });

  it("word count span has aria-atomic=\"true\"", () => {
    expect(src).toContain('aria-atomic="true"');
  });

  it("aria-live and aria-atomic are near the word count", () => {
    // Anchor on filteredVocab.length to find the right live region
    // (reader page may have multiple aria-live spans)
    const vocabIdx = src.indexOf("filteredVocab.length");
    expect(vocabIdx).toBeGreaterThan(-1);
    const window = src.slice(Math.max(0, vocabIdx - 200), vocabIdx + 200);
    expect(window).toContain('aria-live="polite"');
    expect(window).toContain('aria-atomic="true"');
  });
});
