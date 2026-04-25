/**
 * Regression test for #1327: the Edit annotation button in the reader sidebar
 * must have a unique aria-label that includes the sentence text, not the static
 * string "Edit annotation" which repeats identically for every card.
 */
import * as fs from "fs";
import * as path from "path";

const src = fs.readFileSync(
  path.join(__dirname, "../app/reader/[bookId]/page.tsx"),
  "utf8",
);

describe('Reader sidebar "Edit annotation" button aria-label (closes #1327)', () => {
  it('does not use static aria-label="Edit annotation"', () => {
    expect(src).not.toContain('aria-label="Edit annotation"');
  });

  it("uses a dynamic aria-label that includes ann.sentence_text", () => {
    expect(src).toMatch(
      /aria-label=\{`Edit annotation for: \$\{ann\.sentence_text\.slice/,
    );
  });
});
