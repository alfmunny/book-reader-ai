/**
 * Regression for #2267 — InsightCard context blockquote must carry a lang
 * attribute for foreign-language book passages (WCAG 3.1.2 Language of Parts,
 * Level AA).
 */
import { readFileSync } from "fs";
import { join } from "path";

const src = readFileSync(
  join(__dirname, "../app/(shell)/notes/[bookId]/page.tsx"),
  "utf-8"
);

describe("Notes InsightCard context blockquote lang attribute (closes #2267)", () => {
  it("InsightCard props interface includes bookLanguage", () => {
    const idx = src.indexOf("function InsightCard(");
    expect(idx).toBeGreaterThan(-1);
    // Look 400 chars ahead to capture the Props block
    const block = src.slice(idx, idx + 400);
    expect(block).toMatch(/bookLanguage\??\s*:/);
  });

  it("InsightCard context blockquote has lang attribute from bookLanguage", () => {
    // Anchor on the unique blockquote className in InsightCard and look backward for lang
    const idx = src.indexOf('"border-l-4 border-amber-200 pl-4 italic text-stone-600 text-sm leading-relaxed"');
    expect(idx).toBeGreaterThan(-1);
    // lang= appears before className on the same tag — look back 60 chars
    const before = src.slice(Math.max(0, idx - 60), idx);
    expect(before).toMatch(/lang=\{bookLanguage/);
  });

  it("InsightCard call site passes bookLanguage prop", () => {
    // The renderInsight function calls InsightCard
    const idx = src.indexOf("function renderInsight");
    expect(idx).toBeGreaterThan(-1);
    const block = src.slice(idx, idx + 400);
    expect(block).toMatch(/bookLanguage=\{bookLanguage\}/);
  });
});
