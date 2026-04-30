/**
 * Regression tests for #2549:
 * "View in notes page" links in AnnotationsSidebar must include the annotation
 * text snippet in aria-label so screen readers can distinguish multiple links
 * (WCAG 2.4.9 Link Purpose - Link Only).
 */
import fs from "fs";
import path from "path";

const src = fs.readFileSync(
  path.resolve(__dirname, "..", "components/AnnotationsSidebar.tsx"),
  "utf-8"
);

describe("AnnotationsSidebar notes-page links have distinct aria-labels (closes #2549)", () => {
  it("notes-page link aria-label includes annotation text snippet", () => {
    // The notes-page link (href contains /notes/) must reference sentence_text
    // to distinguish each link when multiple annotations are shown.
    // Use a regex over the full source: within 700 chars of the href attr,
    // an aria-label referencing sentence_text must appear (className alone is ~240 chars).
    expect(src).toMatch(
      /href=\{`\/notes\/\$\{bookId\}#annotation-[\s\S]{0,700}aria-label[\s\S]{0,60}sentence_text/
    );
  });

  it("no generic 'View in notes page' aria-label without annotation context", () => {
    // The old pattern: static string that's same for all annotations
    expect(src).not.toContain('aria-label="View in notes page"');
  });
});
