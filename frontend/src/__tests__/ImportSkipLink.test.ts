/**
 * Static assertion: import/[bookId] page <main> has id=main-content.
 * Closes #1207
 */
import fs from "fs";
import path from "path";

function read(rel: string): string {
  return fs.readFileSync(path.join(process.cwd(), rel), "utf8");
}

describe("Import page skip-link target", () => {
  it("import/[bookId]/page.tsx <main> has id=main-content", () => {
    const src = read("src/app/import/[bookId]/page.tsx");
    expect(src).toContain('id="main-content"');
    expect(src).toMatch(/<main\b[^>]*id=["']main-content["']/);
  });
});
