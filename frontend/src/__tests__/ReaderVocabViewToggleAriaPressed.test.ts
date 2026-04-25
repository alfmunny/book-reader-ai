import * as fs from "fs";
import * as path from "path";

const src = fs.readFileSync(
  path.join(__dirname, "../app/reader/[bookId]/page.tsx"),
  "utf8"
);

describe("reader vocabulary sidebar view toggle aria-pressed (closes #1300)", () => {
  it("vocab view toggle button has aria-pressed={vocabView === v}", () => {
    expect(src).toContain("aria-pressed={vocabView === v}");
  });
});
