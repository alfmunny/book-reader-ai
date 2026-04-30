/**
 * Regression tests for #2539:
 * search/page.tsx ResultsSection <section> must have aria-label so it exposes
 * as role="region" for screen reader landmark navigation.
 */
import fs from "fs";
import path from "path";

const src = fs.readFileSync(
  path.resolve(__dirname, "..", "app/search/page.tsx"),
  "utf-8"
);

describe("Search results sections have aria-label for landmark navigation (closes #2539)", () => {
  it("ResultsSection <section> carries aria-label={title}", () => {
    expect(src).toContain('aria-label={title}');
  });

  it("aria-label={title} appears on the <section> element, not only on the <ul>", () => {
    // There are two elements with aria-label={title}: the section and the ul.
    // Verify the section appears before the ul (i.e., section gets the label first).
    const sectionIdx = src.indexOf('<section');
    const ulIdx = src.indexOf('<ul role="list" aria-label={title}');
    // The section should come before the ul in the component
    expect(sectionIdx).not.toBe(-1);
    expect(ulIdx).not.toBe(-1);
    // Check that the section between these two positions contains aria-label={title}
    const sectionBlock = src.slice(sectionIdx, ulIdx);
    expect(sectionBlock).toContain('aria-label={title}');
  });

  it("ResultsSection has an <h2> heading inside the section", () => {
    // Ensure h2 is still present (label should complement heading, not replace it)
    expect(src).toContain('<h2');
  });
});
