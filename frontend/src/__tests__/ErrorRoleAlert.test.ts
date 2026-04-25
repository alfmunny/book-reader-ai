/**
 * Static assertions: error messages have role=alert.
 * Closes #1112
 */
import fs from "fs";
import path from "path";

const annotationToolbar = fs.readFileSync(
  path.join(process.cwd(), "src/components/AnnotationToolbar.tsx"),
  "utf8",
);
const chapterSummary = fs.readFileSync(
  path.join(process.cwd(), "src/components/ChapterSummary.tsx"),
  "utf8",
);
const notesPage = fs.readFileSync(
  path.join(process.cwd(), "src/app/notes/page.tsx"),
  "utf8",
);
const notesBookPage = fs.readFileSync(
  path.join(process.cwd(), "src/app/notes/[bookId]/page.tsx"),
  "utf8",
);
const vocabPage = fs.readFileSync(
  path.join(process.cwd(), "src/app/vocabulary/page.tsx"),
  "utf8",
);

describe("Error role=alert", () => {
  it("AnnotationToolbar error block has role=alert", () => {
    // Locate the {error && ...} render block and check it includes role=alert
    const errorBlockIdx = annotationToolbar.indexOf("{/* Error */}");
    expect(errorBlockIdx).toBeGreaterThan(0);
    const after = annotationToolbar.slice(errorBlockIdx, errorBlockIdx + 400);
    expect(after).toContain('role="alert"');
  });

  it("ChapterSummary error block has role=alert", () => {
    const idx = chapterSummary.indexOf("Could not generate summary");
    expect(idx).toBeGreaterThan(0);
    const block = chapterSummary.slice(Math.max(0, idx - 300), idx + 100);
    expect(block).toContain('role="alert"');
  });

  it("notes overview Failed-to-load block has role=alert", () => {
    const idx = notesPage.indexOf("Failed to load notes");
    expect(idx).toBeGreaterThan(0);
    const block = notesPage.slice(Math.max(0, idx - 400), idx + 100);
    expect(block).toContain('role="alert"');
  });

  it("notes/[bookId] Failed-to-load block has role=alert", () => {
    const idx = notesBookPage.indexOf("Failed to load notes");
    expect(idx).toBeGreaterThan(0);
    const block = notesBookPage.slice(Math.max(0, idx - 400), idx + 100);
    expect(block).toContain('role="alert"');
  });

  it("vocabulary Failed-to-load block has role=alert", () => {
    const idx = vocabPage.indexOf("Failed to load vocabulary");
    expect(idx).toBeGreaterThan(0);
    const block = vocabPage.slice(Math.max(0, idx - 400), idx + 100);
    expect(block).toContain('role="alert"');
  });
});
