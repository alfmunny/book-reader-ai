/**
 * Regression test for #1867 — BookCard cover image used alt={book.title},
 * causing screen readers to announce the book title twice (once from the img alt,
 * once from the visible <p> below it). Cover images inside buttons are decorative;
 * they must use alt="" so AT ignores them.
 */
import { readFileSync } from "fs";
import { join } from "path";

const src = readFileSync(
  join(process.cwd(), "src/components/BookCard.tsx"),
  "utf-8"
);

describe("BookCard cover image alt text (WCAG 1.1.1)", () => {
  it("uses alt='' (empty) on the cover img, not alt={book.title}", () => {
    // Must not have alt={book.title} or alt={book.title} variants
    expect(src).not.toMatch(/alt=\{book\.title\}/);
  });

  it("cover img element has an empty alt attribute", () => {
    // The img with the book cover src should have alt=""
    const imgBlock = src.match(/<img[\s\S]{0,200}?object-cover[\s\S]{0,200}?>/);
    expect(imgBlock).not.toBeNull();
    expect(imgBlock![0]).toContain('alt=""');
  });
});
