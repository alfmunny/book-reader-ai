/**
 * Regression for #2269 — ChapterCard snippet must carry a lang attribute for
 * foreign-language book chapters (WCAG 3.1.2 Language of Parts, Level AA).
 */
import { readFileSync } from "fs";
import { join } from "path";

const page = readFileSync(
  join(__dirname, "../app/search/page.tsx"),
  "utf-8"
);

const api = readFileSync(
  join(__dirname, "../lib/api.ts"),
  "utf-8"
);

describe("Search ChapterCard snippet lang attribute (closes #2269)", () => {
  it("InAppSearchResult chapter type includes book_language field", () => {
    const idx = api.indexOf('type: "chapter"');
    expect(idx).toBeGreaterThan(-1);
    const block = api.slice(idx, idx + 200);
    expect(block).toMatch(/book_language\??\s*:/);
  });

  it("ChapterCard SnippetHtml is wrapped with lang from r.book_language", () => {
    // ">Chapter</div>" is unique to ChapterCard (AnnotationCard: "Annotation · Ch.", VocabularyCard: "Vocabulary · Ch.")
    const anchor = page.indexOf('"text-xs text-stone-600">Chapter</div>');
    expect(anchor).toBeGreaterThan(-1);
    // lang-wrapped snippet comes after the unique badge text
    const after = page.slice(anchor, anchor + 200);
    expect(after).toMatch(/lang=\{r\.book_language/);
  });
});
