import * as fs from "fs";
import * as path from "path";

const src = fs.readFileSync(
  path.join(__dirname, "../app/reader/[bookId]/page.tsx"),
  "utf8"
);

describe("reader page select elements aria-label (closes #969)", () => {
  it("desktop chapter navigation select has aria-label", () => {
    // The desktop chapter nav select sits near goToChapter — find the first occurrence
    const idx = src.indexOf("goToChapter(Number(e.target.value))");
    expect(idx).toBeGreaterThan(-1);
    const window = src.slice(Math.max(0, idx - 450), idx + 50);
    expect(window).toContain('aria-label="Go to chapter"');
  });

  it("translation sidebar target language select has id for label association", () => {
    const idx = src.indexOf('"reader-trans-lang"');
    expect(idx).toBeGreaterThan(-1);
  });

  it("mobile translation expand panel select has aria-label", () => {
    // The mobile expand panel select has translateExpanded context and setTranslationLang
    const idx = src.indexOf("translateExpanded && translationEnabled");
    expect(idx).toBeGreaterThan(-1);
    const window = src.slice(idx, idx + 600);
    expect(window).toContain('aria-label="Translation language"');
  });

  it("mobile chapter navigation select has aria-label", () => {
    // The mobile chapter nav select is the second goToChapter occurrence
    const first = src.indexOf("goToChapter(Number(e.target.value))");
    expect(first).toBeGreaterThan(-1);
    const idx = src.indexOf("goToChapter(Number(e.target.value))", first + 1);
    expect(idx).toBeGreaterThan(-1);
    const window = src.slice(Math.max(0, idx - 450), idx + 50);
    expect(window).toContain('aria-label="Go to chapter"');
  });
});
