/**
 * Static assertion: reader page wrapper is <main id="main-content">.
 * Closes #1184
 */
import fs from "fs";
import path from "path";

const reader = fs.readFileSync(
  path.join(process.cwd(), "src/app/reader/[bookId]/page.tsx"),
  "utf8",
);

describe("Reader page main landmark", () => {
  it("uses <main> with id=main-content for the page wrapper", () => {
    expect(reader).toMatch(/<main[^>]*id="main-content"[^>]*className="h-screen bg-parchment/);
  });

  it("does not use <div> for the page wrapper", () => {
    expect(reader).not.toMatch(/<div className="h-screen bg-parchment flex flex-col overflow-hidden">/);
  });
});
