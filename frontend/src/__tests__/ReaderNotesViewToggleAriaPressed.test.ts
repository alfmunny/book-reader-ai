import fs from "fs";
import path from "path";

const src = fs.readFileSync(
  path.join(__dirname, "../app/reader/[bookId]/page.tsx"),
  "utf8",
);

describe("reader notes sidebar view toggle aria-pressed (issue #1289)", () => {
  it("adds aria-pressed to notes chapter/all toggle buttons", () => {
    expect(src).toMatch(/aria-pressed=\{notesView === v\}/);
  });
});
