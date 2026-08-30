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
  "src/app/(shell)/decks/page.tsx",
  "src/app/(shell)/profile/page.tsx",
  "src/app/(shell)/search/page.tsx",
  "src/app/(shell)/upload/page.tsx",
  "src/app/(shell)/upload/[bookId]/chapters/page.tsx",
  "src/app/(shell)/decks/new/page.tsx",
];

describe("Skip-link main-content anchor on remaining pages", () => {
  for (const page of pages) {
    it(`${page} has id=main-content somewhere`, () => {
      const src = read(page);
      expect(src).toContain('id="main-content"');
    });
  }
});
