import * as fs from "fs";
import * as path from "path";

const src = fs.readFileSync(
  path.join(__dirname, "../app/admin/books/page.tsx"),
  "utf8"
);

describe("admin books page aria-expanded on toggle buttons (closes #1265)", () => {
  it("book row toggle has aria-expanded", () => {
    expect(src).toMatch(/aria-expanded=\{isExpanded\}/);
  });

  it("language section toggle has aria-expanded", () => {
    expect(src).toMatch(/aria-expanded=\{isLangExpanded\}/);
  });
});
