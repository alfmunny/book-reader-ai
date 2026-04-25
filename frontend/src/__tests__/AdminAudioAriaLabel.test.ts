import fs from "fs";
import path from "path";

const src = fs.readFileSync(
  path.join(__dirname, "../app/admin/audio/page.tsx"),
  "utf8"
);

describe("admin audio delete button aria-label (issue #1273)", () => {
  it("delete button has aria-label with book and chapter context", () => {
    expect(src).toMatch(/aria-label=\{`Delete audio for Book \$\{a\.book_id\}, Chapter \$\{a\.chapter_index \+ 1\}`\}/);
  });
});
