/**
 * Regression test for #2065: delete buttons on notes page must announce
 * the "deleting" state to screen readers via aria-busy and a dynamic aria-label.
 */
import * as fs from "fs";
import * as path from "path";

const src = fs.readFileSync(
  path.join(__dirname, "../app/(shell)/notes/[bookId]/page.tsx"),
  "utf8"
);

describe("Notes page delete buttons announce deleting state (closes #2065)", () => {
  it("annotation delete button has aria-busy={isDeleting}", () => {
    expect(src).toMatch(/aria-busy=\{isDeleting\}/);
  });

  it("annotation delete button label changes when isDeleting is true", () => {
    expect(src).toMatch(/isDeleting\s*\?\s*["']Deleting[^"']*["']/);
  });

  it("insight delete button has aria-busy={isDeleting}", () => {
    // Both AnnotationCard and InsightCard must have aria-busy
    const matches = src.match(/aria-busy=\{isDeleting\}/g);
    expect(matches).not.toBeNull();
    expect(matches!.length).toBeGreaterThanOrEqual(2);
  });
});
