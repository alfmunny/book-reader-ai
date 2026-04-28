/**
 * Regression test for #1909: Admin books "+Translate" button must have aria-label
 * referencing the book title so screen readers can distinguish per-book buttons.
 */
import * as fs from "fs";
import * as path from "path";

const src = fs.readFileSync(
  path.join(__dirname, "../app/admin/books/page.tsx"),
  "utf8",
);

describe("Admin books Translate button aria-label (closes #1909)", () => {
  it("Translate button has aria-label with book title context", () => {
    expect(src).toMatch(/aria-label=\{`Translate \$\{b\.title\} into/);
  });

  it("Translate button does not rely solely on title= for its name", () => {
    // The button section around queueingLangFor should have an aria-label, not only title=
    const translateBtnSection = src.match(/queueingLangFor[\s\S]{0,200}Translate/)?.[0] ?? "";
    expect(translateBtnSection).toMatch(/aria-label=/);
  });
});
