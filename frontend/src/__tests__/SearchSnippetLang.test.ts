/**
 * Regression for #2265 — search result snippet text must carry lang attributes
 * on foreign-language content (WCAG 3.1.2 Language of Parts, Level AA).
 *
 * VocabularyCard: snippet wrapped with lang from r.language.
 * AnnotationCard: snippet wrapped with lang from r.book_language (added to annotation results).
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

describe("Search result snippet lang attributes (closes #2265)", () => {
  it("InAppSearchResult annotation type includes book_language field", () => {
    const idx = api.indexOf('type: "annotation"');
    expect(idx).toBeGreaterThan(-1);
    const block = api.slice(idx, idx + 300);
    expect(block).toMatch(/book_language\??\s*:/);
  });

  it("VocabularyCard SnippetHtml is wrapped with lang from r.language", () => {
    // This exact string is unique to the VocabularyCard snippet wrapper
    const idx = page.indexOf('lang={r.language ?? undefined}><SnippetHtml');
    expect(idx).toBeGreaterThan(-1);
  });

  it("AnnotationCard SnippetHtml is wrapped with lang from r.book_language", () => {
    // This exact string is unique to the AnnotationCard snippet wrapper
    const idx = page.indexOf('lang={r.book_language ?? undefined}><SnippetHtml');
    expect(idx).toBeGreaterThan(-1);
  });
});
