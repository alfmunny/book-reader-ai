/**
 * Regression test for #1332: import page stage progress bars must use unique,
 * semantically accurate aria-labels (not the static "Chapter translation progress"
 * which repeats for every stage and is wrong for the "fetching" stage).
 */
import * as fs from "fs";
import * as path from "path";

const src = fs.readFileSync(
  path.join(__dirname, "../app/import/[bookId]/page.tsx"),
  "utf8",
);

describe('Import page stage progress bar aria-labels (closes #1332)', () => {
  it('does not use static aria-label="Chapter translation progress"', () => {
    expect(src).not.toContain('aria-label="Chapter translation progress"');
  });

  it("uses STAGE_LABELS[stage] in the aria-label for unique per-stage labels", () => {
    expect(src).toMatch(
      /aria-label=\{`\$\{STAGE_LABELS\[stage\]\} progress`\}/,
    );
  });
});
