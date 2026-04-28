/**
 * Regression test for #1919:
 * Translated text rendered by SentenceReader must carry a lang attribute so
 * screen readers use the correct pronunciation engine (WCAG 3.1.2).
 */
import { readFileSync } from "fs";
import { join } from "path";

const componentSrc = readFileSync(
  join(__dirname, "../components/SentenceReader.tsx"),
  "utf8",
);

const pageSrc = readFileSync(
  join(__dirname, "../app/reader/[bookId]/page.tsx"),
  "utf8",
);

describe("SentenceReader translated text lang attribute (closes #1919)", () => {
  it("SentenceReader accepts a translationLang prop", () => {
    expect(componentSrc).toMatch(/translationLang/);
  });

  it("parallel mode translated paragraph has lang attribute", () => {
    // Locate the parallel-mode translation block (inside data-translation div)
    const parallelBlock =
      componentSrc.match(/data-translation="true"[\s\S]{0,800}font-serif[\s\S]{0,200}translationText/)?.[0] ?? "";
    expect(parallelBlock).toMatch(/lang=/);
  });

  it("inline mode translated paragraph has lang attribute", () => {
    // The inline <p> has lang= before data-translation= — search for both in proximity
    const inlineBlock =
      componentSrc.match(/lang=\{translationLang\}[\s\S]{0,50}data-translation[\s\S]{0,200}border-l-2/)?.[0] ?? "";
    expect(inlineBlock).toMatch(/lang=/);
  });

  it("reader page passes translationLang to SentenceReader", () => {
    // translationLang= comes after translationDisplayMode= in the JSX, extend capture past it
    const sentenceReaderBlock =
      pageSrc.match(/<SentenceReader[\s\S]{0,2500}translationLoading/)?.[0] ?? "";
    expect(sentenceReaderBlock).toMatch(/translationLang=/);
  });
});
