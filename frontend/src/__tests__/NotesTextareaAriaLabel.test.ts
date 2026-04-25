/**
 * Regression test for #1249: annotation note editing textarea must have
 * an accessible label so screen readers announce it on focus.
 */
import * as fs from "fs";
import * as path from "path";

const src = fs.readFileSync(
  path.join(__dirname, "../app/notes/[bookId]/page.tsx"),
  "utf8"
);

describe("Notes page annotation textarea aria-label (closes #1249)", () => {
  it("editing textarea has aria-label", () => {
    const idx = src.indexOf("Edit note");
    expect(idx).toBeGreaterThan(-1);
    const window = src.slice(Math.max(0, idx - 50), idx + 100);
    expect(window).toContain('aria-label');
  });

  it("editing textarea aria-label describes the purpose", () => {
    expect(src).toContain('aria-label="Edit note"');
  });
});
