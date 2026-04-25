/**
 * Static assertion: vocabulary/flashcards page <main> has id=main-content.
 * Closes #1209
 */
import fs from "fs";
import path from "path";

function read(rel: string): string {
  return fs.readFileSync(path.join(process.cwd(), rel), "utf8");
}

describe("Flashcards page skip-link target", () => {
  it("vocabulary/flashcards/page.tsx <main> has id=main-content", () => {
    const src = read("src/app/vocabulary/flashcards/page.tsx");
    expect(src).toContain('id="main-content"');
    expect(src).toMatch(/<main\b[^>]*id=["']main-content["']/);
  });
});
