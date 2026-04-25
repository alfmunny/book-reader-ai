import fs from "fs";
import path from "path";

const src = fs.readFileSync(
  path.join(__dirname, "../app/notes/[bookId]/page.tsx"),
  "utf8"
);

describe("notes view mode toggle aria-pressed (issue #1276)", () => {
  it("view mode toggle buttons have aria-pressed", () => {
    expect(src).toMatch(/aria-pressed=\{viewMode === m\}/);
  });
});
