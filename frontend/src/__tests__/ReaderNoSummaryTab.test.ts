/**
 * Owner decision (2026-08-25): the Chapter Summary tab is removed from the
 * reader menu. The ChapterSummary component and backend endpoint stay (easy
 * to restore), but the reader must not offer the tab.
 */
import fs from "fs";
import path from "path";

const reader = fs.readFileSync(
  path.join(process.cwd(), "src/app/reader/[bookId]/page.tsx"),
  "utf8",
);

test("the reader menu no longer offers a Summary tab", () => {
  expect(reader).not.toMatch(/setSidebarTab\("summary"\)/);
  expect(reader).not.toMatch(/aria-label="Chapter summary"/);
  expect(reader).not.toContain("ChapterSummary");
});
