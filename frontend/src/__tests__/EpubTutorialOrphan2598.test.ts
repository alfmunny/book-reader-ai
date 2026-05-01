/**
 * Regression test for #2598:
 * upload-epub.md is an orphaned duplicate with a localhost URL.
 * After fix: the file must not exist; epub-upload.md must remain.
 */
import * as fs from "fs";
import * as path from "path";

const tutorialsDir = path.join(__dirname, "../../../docs/tutorials");

describe("EPUB tutorial deduplication (closes #2598)", () => {
  it("upload-epub.md (orphaned duplicate) no longer exists", () => {
    const orphan = path.join(tutorialsDir, "upload-epub.md");
    expect(fs.existsSync(orphan)).toBe(false);
  });

  it("epub-upload.md (canonical, indexed) still exists", () => {
    const canonical = path.join(tutorialsDir, "epub-upload.md");
    expect(fs.existsSync(canonical)).toBe(true);
  });

  it("index.md links to epub-upload.md, not upload-epub.md", () => {
    const index = fs.readFileSync(path.join(tutorialsDir, "index.md"), "utf8");
    expect(index).toMatch(/epub-upload\.md/);
    expect(index).not.toMatch(/upload-epub\.md/);
  });

  it("epub-upload.md contains no localhost URLs", () => {
    const canonical = fs.readFileSync(
      path.join(tutorialsDir, "epub-upload.md"),
      "utf8",
    );
    expect(canonical).not.toMatch(/localhost/);
  });
});
