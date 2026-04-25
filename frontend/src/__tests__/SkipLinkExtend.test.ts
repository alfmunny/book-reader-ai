/**
 * Static assertion: remaining pages have id=main-content for the skip link.
 * Closes #1181
 */
import fs from "fs";
import path from "path";

function read(rel: string): string {
  return fs.readFileSync(path.join(process.cwd(), rel), "utf8");
}

const pages = [
  "src/app/decks/page.tsx",
  "src/app/profile/page.tsx",
  "src/app/search/page.tsx",
  "src/app/upload/page.tsx",
  "src/app/upload/[bookId]/chapters/page.tsx",
  "src/app/decks/new/page.tsx",
];

describe("Skip-link main-content anchor on remaining pages", () => {
  for (const page of pages) {
    it(`${page} has id=main-content somewhere`, () => {
      const src = read(page);
      expect(src).toContain('id="main-content"');
    });
  }
});
