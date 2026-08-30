/**
 * Regression test for #2465: vocabulary occurrence-count badge must have
 * aria-label so screen readers say "N occurrences" instead of ambiguous "N×".
 */
import fs from "fs";
import path from "path";

const vocabPage = fs.readFileSync(
  path.resolve(__dirname, "../app/(shell)/vocabulary/page.tsx"),
  "utf8",
);

describe("Vocabulary occurrence badge aria-label (closes #2465)", () => {
  it("occurrence count badge has aria-label describing occurrences", () => {
    const idx = vocabPage.indexOf("occurrenceCount}×");
    expect(idx).toBeGreaterThan(-1);
    const window = vocabPage.slice(Math.max(0, idx - 200), idx + 100);
    expect(window).toMatch(/aria-label/);
  });
});
