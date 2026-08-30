import * as fs from "fs";
import * as path from "path";

// text-stone-300 (#d6d3d1) on white = 1.5:1 — fails WCAG 1.4.3 AA
// dramatically. Closes #1559.

const usersSrc = fs.readFileSync(
  path.join(__dirname, "../app/(shell)/admin/users/page.tsx"),
  "utf8",
);

const booksSrc = fs.readFileSync(
  path.join(__dirname, "../app/(shell)/admin/books/page.tsx"),
  "utf8",
);

describe("admin pages do not render visible text in text-stone-300 (closes #1559)", () => {
  it("(shell)/admin/users does not have <span class=...text-stone-300>", () => {
    expect(usersSrc).not.toMatch(/<span[^>]*text-stone-300/);
  });

  it("(shell)/admin/books does not have <span class=...text-stone-300>", () => {
    expect(booksSrc).not.toMatch(/<span[^>]*text-stone-300/);
  });
});
