/**
 * Regression for issue #1767:
 * When requestChapterTranslation throws a non-401/403 error the reader sets
 * translationUsedProvider to a string starting with "error". The render chain
 * in reader/[bookId]/page.tsx must have an explicit case for this prefix;
 * without it the user sees a blank panel with no feedback.
 */
import * as fs from "fs";
import * as path from "path";

const src = fs.readFileSync(
  path.join(__dirname, "../app/reader/[bookId]/page.tsx"),
  "utf8",
);

describe("translation error feedback (closes #1767)", () => {
  it("render chain handles translationUsedProvider values starting with 'error'", () => {
    expect(src).toMatch(/translationUsedProvider\.startsWith\(["']error["']\)/);
  });
});
