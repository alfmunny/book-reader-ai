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
    const idx = src.indexOf('aria-live="polite"');
    expect(idx).toBeGreaterThan(-1);
    const window = src.slice(Math.max(0, idx - 100), idx + 200);
    expect(window).toContain("filteredVocab.length");
    expect(window).toContain('aria-atomic="true"');
  });
});
