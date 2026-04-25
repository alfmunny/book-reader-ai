/**
 * Static assertion: upload + chapters page section labels use <h2>.
 * Closes #1165
 */
import fs from "fs";
import path from "path";

const uploadPage = fs.readFileSync(
  path.join(process.cwd(), "src/app/upload/page.tsx"),
  "utf8",
);
const chaptersPage = fs.readFileSync(
  path.join(process.cwd(), "src/app/upload/[bookId]/chapters/page.tsx"),
  "utf8",
);

describe("Upload + chapters section heading hierarchy", () => {
  it('upload page uses <h2> for "Tips" label', () => {
    expect(uploadPage).toMatch(/<h2[^>]*>Tips<\/h2>/);
    expect(uploadPage).not.toMatch(/<p[^>]*>Tips<\/p>/);
  });

  it('chapters page uses <h2> for "Preview" label', () => {
    expect(chaptersPage).toMatch(/<h2[^>]*>Preview<\/h2>/);
    expect(chaptersPage).not.toMatch(/<p[^>]*>Preview<\/p>/);
  });
});
