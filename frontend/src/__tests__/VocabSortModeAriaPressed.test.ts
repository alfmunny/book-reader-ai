import fs from "fs";
import path from "path";

const src = fs.readFileSync(
  path.join(__dirname, "../app/vocabulary/page.tsx"),
  "utf8",
);

describe("vocabulary sort mode buttons aria-pressed (issue #1279)", () => {
  it("sets aria-pressed on sort mode button", () => {
    expect(src).toMatch(/aria-pressed=\{sortMode === value\}/);
  });
});
