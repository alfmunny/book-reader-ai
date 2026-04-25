/**
 * Static assertion: BookCard has focus-visible ring + lift to mirror hover.
 * Closes #1143
 */
import fs from "fs";
import path from "path";

const card = fs.readFileSync(
  path.join(process.cwd(), "src/components/BookCard.tsx"),
  "utf8",
);

describe("BookCard focus-visible styles", () => {
  it("primary book button has focus-visible ring", () => {
    expect(card).toMatch(/focus-visible:ring-2/);
  });

  it("primary book button has focus-visible translate (mirroring hover lift)", () => {
    expect(card).toMatch(/focus-visible:-translate-y-0\.5/);
  });

  it("focus-visible:outline-none disables default outline in favor of ring", () => {
    expect(card).toContain("focus-visible:outline-none");
  });
});
