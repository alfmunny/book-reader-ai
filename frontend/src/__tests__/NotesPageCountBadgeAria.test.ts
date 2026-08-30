/**
 * Regression test for #1917:
 * Notes page per-book count badges must have aria-labels so screen readers
 * can announce "3 annotations" instead of just "3".
 */
import { readFileSync } from "fs";
import { join } from "path";

const src = readFileSync(
  join(__dirname, "../app/(shell)/notes/page.tsx"),
  "utf8",
);

// Extract only the per-book list badge section (book.annCount / book.insCount / book.vocCount)
// — distinct from the header total summary which was already labelled.
const listBadgeSection =
  src.match(/book\.annCount > 0[\s\S]{0,1200}book\.vocCount > 0[\s\S]{0,500}/)?.[0] ?? "";

describe("Notes page per-book count badge accessibility (closes #1917)", () => {
  it("annotation count badge has aria-label containing 'annotation'", () => {
    expect(listBadgeSection).toMatch(/aria-label=.*annotation/);
  });

  it("insight count badge has aria-label containing 'insight'", () => {
    expect(listBadgeSection).toMatch(/aria-label=.*insight/);
  });

  it("vocabulary count badge has aria-label containing 'vocabular'", () => {
    expect(listBadgeSection).toMatch(/aria-label=.*vocabular/);
  });

  it("count numbers inside per-book badges are aria-hidden", () => {
    expect(listBadgeSection).toMatch(/aria-hidden="true"/);
  });
});
