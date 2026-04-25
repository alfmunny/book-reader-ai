import * as fs from "fs";
import * as path from "path";

const pageSrc = fs.readFileSync(
  path.join(__dirname, "../app/page.tsx"),
  "utf8",
);

describe("WCAG 1.4.3 contrast — text-amber-400 at small sizes (wave 12) (closes #1405)", () => {
  it("popular books list rank index does not use text-amber-400", () => {
    expect(pageSrc).not.toMatch(
      /<span className="text-xs text-amber-400[^"]*tabular-nums">\s*\{\(popularPage - 1\)/,
    );
  });

  it("popular books list download count does not use text-amber-400", () => {
    expect(pageSrc).not.toMatch(
      /<span className="text-xs text-amber-400[^"]*tabular-nums">\s*\{book\.download_count/,
    );
  });
});
