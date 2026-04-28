/**
 * Regression tests for issue #1893 — pending, upload, decks/new, and all admin
 * pages must set document.title (WCAG 2.4.2 Page Titled).
 */
import { readFileSync } from "fs";
import { join } from "path";

const pages: Array<[string, string, RegExp]> = [
  ["pending/page.tsx", "Pending", /pending/i],
  ["upload/page.tsx", "Upload", /upload/i],
  ["upload/[bookId]/chapters/page.tsx", "Upload chapters", /upload|chapter/i],
  ["decks/new/page.tsx", "New Deck", /deck/i],
  ["admin/page.tsx", "Admin", /admin/i],
  ["admin/books/page.tsx", "Admin: Books", /admin|book/i],
  ["admin/audio/page.tsx", "Admin: Audio", /admin|audio/i],
  ["admin/users/page.tsx", "Admin: Users", /admin|user/i],
  ["admin/bulk/page.tsx", "Admin: Bulk", /admin|bulk/i],
  ["admin/queue/page.tsx", "Admin: Queue", /admin|queue/i],
  ["admin/uploads/page.tsx", "Admin: Uploads", /admin|upload/i],
];

describe("Missing page titles — document.title (WCAG 2.4.2, #1893)", () => {
  for (const [relPath, label, titlePattern] of pages) {
    const src = readFileSync(join(__dirname, `../app/${relPath}`), "utf8");

    describe(`${label} page`, () => {
      it("sets document.title", () => {
        expect(src).toMatch(/document\.title\s*=/);
      });

      it("includes a descriptive label in document.title", () => {
        const idx = src.indexOf("document.title");
        const region = src.slice(idx, idx + 120);
        expect(region).toMatch(titlePattern);
      });
    });
  }
});
