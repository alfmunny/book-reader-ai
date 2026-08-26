/**
 * Book grids expose list semantics (WCAG 1.3.1) so screen readers announce the
 * item count and allow list navigation.
 *
 * Originally covered the Popular Classics and Gutenberg search grids. Both went
 * with the Discover tab (#2711); the two grids that replaced them — the home
 * catalog and Your Bookshelf — carry the same requirement.
 */
import fs from "fs";
import path from "path";

const read = (rel: string) =>
  fs.readFileSync(path.join(__dirname, "..", rel), "utf8");

const homeSrc = read("app/page.tsx");
const bookshelfSrc = read("app/bookshelf/page.tsx");

function assertListGrid(src: string, label: string) {
  // Match the role and label together: the bookshelf has several lists now, and
  // "Your Bookshelf" also labels the enclosing <section>.
  const idx = src.indexOf(`role="list" aria-label="${label}"`);
  expect(idx).toBeGreaterThan(-1);
  const window = src.slice(idx, idx + 200);
  // Items must be <li>, not bare divs, or the list role is a lie.
  expect(src.slice(idx, idx + 700)).toMatch(/<li\b/);
}

describe("book grids expose list semantics", () => {
  it("home catalog grid is a labelled list", () => {
    assertListGrid(homeSrc, "The Library");
  });

  it("bookshelf grid is a labelled list", () => {
    assertListGrid(bookshelfSrc, "Your Bookshelf");
  });

  it("both grids render their items as list items", () => {
    for (const src of [homeSrc, bookshelfSrc]) {
      expect(src).toMatch(/<li key=\{book\.id\}>/);
    }
  });
});
