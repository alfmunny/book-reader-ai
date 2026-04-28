/**
 * Regression test for #1903: popular-books list-view buttons must have
 * aria-label so screen readers announce book title/author without the
 * rank number and download count cluttering the accessible name.
 */
import * as fs from "fs";
import * as path from "path";

const src = fs.readFileSync(
  path.join(__dirname, "../app/page.tsx"),
  "utf8",
);

describe("Popular books list-view button accessible name (closes #1903)", () => {
  it("list-view book button has aria-label referencing book.title", () => {
    expect(src).toMatch(/aria-label=\{`Open \$\{book\.title\}/);
  });

  it("aria-label includes author attribution", () => {
    expect(src).toMatch(/aria-label=\{`Open \$\{book\.title\}[^`]*book\.authors/);
  });
});
