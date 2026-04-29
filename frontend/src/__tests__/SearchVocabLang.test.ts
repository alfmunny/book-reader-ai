/**
 * Regression for #2263 — search page VocabularyCard must add lang attribute
 * on the word div and the InAppSearchResult vocabulary type must include a
 * language field (WCAG 3.1.2 Language of Parts, Level AA).
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

describe("Search page vocabulary lang attribute (closes #2263)", () => {
  it("InAppSearchResult vocabulary type includes language field", () => {
    const idx = api.indexOf('type: "vocabulary"');
    expect(idx).toBeGreaterThan(-1);
    const block = api.slice(idx, idx + 200);
    expect(block).toMatch(/language\??\s*:/);
  });

  it("VocabularyCard word div has lang attribute from r.language", () => {
    // Anchor on the unique content {r.word} inside VocabularyCard and look back
    const idx = page.indexOf(">{r.word}</div>");
    expect(idx).toBeGreaterThan(-1);
    const before = page.slice(Math.max(0, idx - 60), idx);
    expect(before).toMatch(/lang=\{r\.language/);
  });
});
