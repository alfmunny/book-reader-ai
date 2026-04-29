/**
 * Regression tests for #2212: truncated book title/author <p> elements must
 * have title attributes so sighted mouse users can hover to read the full text.
 */
import * as fs from "fs";
import * as path from "path";

const pageSrc = fs.readFileSync(
  path.join(__dirname, "../app/page.tsx"),
  "utf8"
);
const cardSrc = fs.readFileSync(
  path.join(__dirname, "../components/BookCard.tsx"),
  "utf8"
);

describe("Truncated title tooltip coverage (closes #2212)", () => {
  it("Popular Classics list-view book title has title attribute", () => {
    const idx = pageSrc.indexOf('text-ink truncate" title={book.title}');
    expect(idx).toBeGreaterThan(-1);
  });

  it("Popular Classics list-view author has title attribute", () => {
    const idx = pageSrc.indexOf('text-amber-700 truncate" title={book.authors.join(", ")}');
    expect(idx).toBeGreaterThan(-1);
  });

  it("Continue Reading banner book title has title attribute", () => {
    const idx = pageSrc.indexOf('line-clamp-1" title={recentBooks[0].title}');
    expect(idx).toBeGreaterThan(-1);
  });

  it("BookCard title paragraph has title attribute", () => {
    const idx = cardSrc.indexOf('line-clamp-2 flex-1" title={book.title}');
    expect(idx).toBeGreaterThan(-1);
  });

  it("BookCard author paragraph has title attribute", () => {
    const idx = cardSrc.indexOf('line-clamp-1" title={book.authors.join(", ")}');
    expect(idx).toBeGreaterThan(-1);
  });
});
