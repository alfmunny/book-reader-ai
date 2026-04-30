/**
 * Regression tests for #2561:
 * Several aria-expanded disclosure buttons are missing aria-controls,
 * preventing AT from navigating to revealed content.
 *
 * Fix:
 *  - Reader sidebar chapter-collapse buttons: add aria-controls + id on ul
 *  - Admin books page book-expand button: add aria-controls + id on panel
 *  - Admin books page lang-expand button: add aria-controls + id on panel
 */
import * as fs from "fs";
import * as path from "path";

const readerSrc = fs.readFileSync(
  path.join(__dirname, "../app/reader/[bookId]/page.tsx"),
  "utf8",
);

const adminBooksSrc = fs.readFileSync(
  path.join(__dirname, "../app/admin/books/page.tsx"),
  "utf8",
);

describe("Disclosure buttons have aria-controls (closes #2561)", () => {
  describe("Reader sidebar chapter-collapse button", () => {
    it("chapter collapse button has aria-controls referencing sidebar-notes-ch-", () => {
      expect(readerSrc).toContain('aria-controls={`sidebar-notes-ch-${ch}`}');
    });

    it("annotations ul has dynamic id matching sidebar-notes-ch-", () => {
      expect(readerSrc).toContain('id={`sidebar-notes-ch-${ch}`}');
    });

    it("aria-controls appears near aria-expanded={!isCollapsed}", () => {
      const idx = readerSrc.indexOf("aria-expanded={!isCollapsed}");
      expect(idx).not.toBe(-1);
      const context = readerSrc.slice(Math.max(0, idx - 50), idx + 200);
      expect(context).toContain("aria-controls={`sidebar-notes-ch-${ch}`}");
    });
  });

  describe("Admin books page — book expand button", () => {
    it("book expand button has aria-controls referencing book-detail-", () => {
      expect(adminBooksSrc).toContain("aria-controls={`book-detail-${b.id}`}");
    });

    it("book detail panel has dynamic id matching book-detail-", () => {
      expect(adminBooksSrc).toContain("id={`book-detail-${b.id}`}");
    });
  });

  describe("Admin books page — language expand button", () => {
    it("lang expand button has aria-controls referencing lang-detail-", () => {
      expect(adminBooksSrc).toContain('aria-controls={`lang-detail-${b.id}-${lang}`}');
    });

    it("lang detail panel has dynamic id matching lang-detail-", () => {
      expect(adminBooksSrc).toContain('id={`lang-detail-${b.id}-${lang}`}');
    });
  });
});
