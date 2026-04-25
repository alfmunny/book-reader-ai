/**
 * Static assertion: login, pending, notes/[bookId] now have main#main-content.
 * Closes #1187
 */
import fs from "fs";
import path from "path";

function read(rel: string): string {
  return fs.readFileSync(path.join(process.cwd(), rel), "utf8");
}

describe("Skip-link final coverage", () => {
  it("login page uses <main id=main-content>", () => {
    const src = read("src/app/login/page.tsx");
    expect(src).toContain('id="main-content"');
  });

  it("pending page uses <main id=main-content>", () => {
    const src = read("src/app/pending/page.tsx");
    expect(src).toContain('id="main-content"');
  });

  it("notes/[bookId] page <main> has id=main-content", () => {
    const src = read("src/app/notes/[bookId]/page.tsx");
    expect(src).toContain('id="main-content"');
  });
});
