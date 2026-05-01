/**
 * Regression test for #2611:
 * Reader page annotation delete undo silently swallows createAnnotation errors.
 * When "Undo" is clicked and the restore API call fails, the toast disappears
 * with no feedback and the annotation is permanently lost.
 *
 * Fix: the onUndo handler must surface the error to the user, not silently drop it.
 */
import * as fs from "fs";
import * as path from "path";

const BARE_CATCH = /\.catch\(\s*\(\s*\)\s*=>\s*\{\s*\}\s*\)/;

const src = fs.readFileSync(
  path.join(__dirname, "../app/reader/[bookId]/page.tsx"),
  "utf8",
);

describe("Reader annotation undo error feedback (closes #2611)", () => {
  it("createAnnotation in undo handler does not have a bare silent catch", () => {
    // Use the JSX block comment as anchor (more precise than the state variable comment)
    const undoSectionStart = src.indexOf("{/* Annotation delete undo toast */}");
    const undoSectionEnd = src.indexOf("{/* Vocabulary save toast */}", undoSectionStart);
    expect(undoSectionStart).not.toBe(-1);
    const undoSection = src.slice(undoSectionStart, undoSectionEnd > 0 ? undoSectionEnd : undoSectionStart + 1500);
    // The catch in this section must not be the silent no-op pattern
    expect(undoSection).toMatch(/createAnnotation/);
    expect(undoSection).not.toMatch(BARE_CATCH);
  });

  it("undo failure handler surfaces an error message to the user", () => {
    const undoSectionStart = src.indexOf("{/* Annotation delete undo toast */}");
    const undoSectionEnd = src.indexOf("{/* Vocabulary save toast */}", undoSectionStart);
    const undoSection = src.slice(undoSectionStart, undoSectionEnd > 0 ? undoSectionEnd : undoSectionStart + 1500);
    expect(undoSection).toMatch(/setAnnotationUndoError|setAnnotationError|setRestoreError|setUndoError/);
  });
});
