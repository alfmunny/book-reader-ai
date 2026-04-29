/**
 * Regression for #2247 — reader vocab sidebar must add lang attribute on
 * foreign-language words and context sentences so screen readers pronounce
 * them correctly (WCAG 3.1.2 Language of Parts, Level AA).
 *
 * Companion to VocabLangAttribute.test.ts which covers vocabulary/page.tsx.
 */
import { readFileSync } from "fs";
import { join } from "path";

const src = readFileSync(
  join(__dirname, "../app/reader/[bookId]/page.tsx"),
  "utf-8"
);

describe("Reader vocab sidebar lang attribute (closes #2247)", () => {
  it("lemma word span has lang attribute from w.language", () => {
    // The lemma span is "text-sm font-semibold text-ink" and renders {lemma}
    const idx = src.indexOf('"text-sm font-semibold text-ink">{lemma}');
    expect(idx).toBeGreaterThan(-1);
    // Look backward 100 chars for lang attribute
    const before = src.slice(Math.max(0, idx - 100), idx);
    expect(before).toMatch(/lang=\{w\.language/);
  });

  it("context sentence span in vocab sidebar has lang attribute", () => {
    // The occurrence sentence span is italic line-clamp-2 and renders occ.sentence_text
    const idx = src.indexOf('"text-xs text-stone-600 italic line-clamp-2"');
    expect(idx).toBeGreaterThan(-1);
    const window = src.slice(Math.max(0, idx - 60), idx + 150);
    expect(window).toMatch(/lang=\{w\.language/);
  });
});
