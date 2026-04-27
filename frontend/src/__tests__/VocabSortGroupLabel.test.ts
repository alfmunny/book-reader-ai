/**
 * Regression test for issue #1803:
 * Vocabulary sort mode segmented control was missing role="group" and aria-label.
 * Fixed by adding role="group" aria-label="Sort by" to the wrapper div.
 */
import * as fs from "fs";
import * as path from "path";

const src = fs.readFileSync(
  path.join(__dirname, "../app/vocabulary/page.tsx"),
  "utf8",
);

describe("Vocabulary sort control group label (closes #1803)", () => {
  it('sort mode control has role="group"', () => {
    expect(src).toMatch(/role="group"[^>]*data-testid="sort-mode-control"|data-testid="sort-mode-control"[^>]*role="group"/);
  });

  it('sort mode control has aria-label="Sort by"', () => {
    expect(src).toMatch(/aria-label="Sort by"/);
  });
});
