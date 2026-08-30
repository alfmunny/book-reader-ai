/**
 * Regression tests for #2537:
 * notes/[bookId] page <section> elements must have aria-label so they expose
 * as role="region" landmarks for screen reader landmark navigation.
 */
import fs from "fs";
import path from "path";

const src = fs.readFileSync(
  path.resolve(__dirname, "..", "app/(shell)/notes/[bookId]/page.tsx"),
  "utf-8"
);

describe("Notes book page sections have aria-label for landmark navigation (closes #2537)", () => {
  it('Annotations section element has aria-label="Annotations"', () => {
    // A <section> (not just the inner <ul>) must carry aria-label="Annotations"
    const matches = [...src.matchAll(/aria-label="Annotations"/g)];
    const onSection = matches.some((m) => {
      const context = src.slice(Math.max(0, m.index! - 100), m.index!);
      return /<section/.test(context) && !/<ul/.test(src.slice(m.index! - 5, m.index!));
    });
    expect(onSection).toBe(true);
  });

  it('AI Insights section has aria-label="AI Insights"', () => {
    // AI Insights only appears on a section (no other element has this label)
    expect(src).toContain('aria-label="AI Insights"');
  });

  it('Vocabulary section has aria-label="Vocabulary"', () => {
    // Check that a section (not just a ul/div) uses aria-label="Vocabulary"
    const idx = src.indexOf('aria-label="Vocabulary"');
    expect(idx).not.toBe(-1);
    // Verify it's on a <section> element (look for <section in the 200 chars before)
    const context = src.slice(Math.max(0, idx - 200), idx);
    expect(context).toMatch(/<section/);
  });

  it("Chapter-view sections have dynamic aria-label from chapterLabel", () => {
    // Section in chapter view must use aria-label={chapterLabel(...)}
    expect(src).toContain("aria-label={chapterLabel(chapters, ch)}");
  });

  it('Book-level Insights section has aria-label="Book-level Insights"', () => {
    expect(src).toContain('aria-label="Book-level Insights"');
  });
});
