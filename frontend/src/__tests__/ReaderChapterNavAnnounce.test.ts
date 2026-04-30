/**
 * Regression test for #2370: reader chapter navigation must announce the new
 * chapter title to screen readers via an aria-live region.
 */
import fs from "fs";
import path from "path";

const src = fs.readFileSync(
  path.join(__dirname, "../app/reader/[bookId]/page.tsx"),
  "utf8",
);

describe("Reader chapter nav aria-live announcement (closes #2370)", () => {
  it("page contains an sr-only aria-live element for chapter announcements", () => {
    const idx = src.indexOf('id="chapter-announce"');
    expect(idx).toBeGreaterThan(-1);
    const block = src.slice(idx, idx + 300);
    expect(block).toMatch(/aria-live="polite"/);
    expect(block).toMatch(/sr-only/);
  });

  it("chapter announce element has aria-atomic", () => {
    const idx = src.indexOf("chapter-announce");
    expect(idx).toBeGreaterThan(-1);
    const block = src.slice(idx, idx + 300);
    expect(block).toMatch(/aria-atomic/);
  });

  it("chapter announce element renders chapters[chapterIndex] title", () => {
    const idx = src.indexOf("chapter-announce");
    const block = src.slice(idx, idx + 400);
    expect(block).toMatch(/chapters\[chapterIndex\]/);
  });
});
