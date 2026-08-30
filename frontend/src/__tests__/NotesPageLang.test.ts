/**
 * Regression for #2251 — notes page must add lang attribute on foreign-language
 * book passages (annotations and vocabulary occurrences) so screen readers
 * pronounce them correctly (WCAG 3.1.2 Language of Parts, Level AA).
 */
import { readFileSync } from "fs";
import { join } from "path";

const src = readFileSync(
  join(__dirname, "../app/(shell)/notes/[bookId]/page.tsx"),
  "utf-8"
);

describe("Notes page lang attribute on book passages (closes #2251)", () => {
  it("AnnotationCard sentence paragraph has lang attribute", () => {
    // The sentence is rendered in a <p className="italic..."> inside AnnotationCard
    const idx = src.indexOf("ann.sentence_text");
    expect(idx).toBeGreaterThan(-1);
    // Look backward 100 chars from sentence_text for lang attribute
    const before = src.slice(Math.max(0, idx - 150), idx);
    expect(before).toMatch(/lang=\{bookLanguage\}/);
  });

  it("VocabItem occurrence sentence has lang attribute", () => {
    // The occurrence sentence is rendered in an <a> inside VocabItem
    const idx = src.indexOf("occurrence.sentence_text");
    expect(idx).toBeGreaterThan(-1);
    // Find the closest lang attribute before occurrence.sentence_text
    const before = src.slice(Math.max(0, idx - 200), idx);
    expect(before).toMatch(/lang=\{bookLanguage\}/);
  });

  it("bookLanguage is derived from meta.languages in the page", () => {
    // The page must compute bookLanguage from meta
    expect(src).toMatch(/bookLanguage.*=.*meta.*languages/);
  });
});
