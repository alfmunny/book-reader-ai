/**
 * Regression test for issue #2402: reader page annotation and highlight saves
 * had no screen-reader success announcement (WCAG 4.1.3).
 *
 * When a dialog/toolbar closes after a successful save, focus returns to the
 * triggering element — screen readers hear nothing about the outcome. A
 * sr-only role="status" live region must announce "Note saved" / "Highlight
 * applied" so AT users get confirmation without requiring focus.
 */
import fs from "fs";
import path from "path";

const src = fs.readFileSync(
  path.join(process.cwd(), "src/app/reader/[bookId]/page.tsx"),
  "utf8",
);

describe("Reader page annotation save announcements (issue #2402)", () => {
  it("tracks a savedAnnotationMsg state variable", () => {
    expect(src).toMatch(/savedAnnotationMsg|setSavedAnnotationMsg/);
  });

  it("has a sr-only role=status live region for annotation save feedback", () => {
    // Must have an always-present live region (not conditional) so AT announces on first fire
    expect(src).toMatch(/sr-only[\s\S]{0,200}role="status"[\s\S]{0,200}savedAnnotationMsg|role="status"[\s\S]{0,200}sr-only[\s\S]{0,200}savedAnnotationMsg/);
  });

  it("onSaved handler for AnnotationToolbar sets a save confirmation message", () => {
    // The onSaved callback should call setSavedAnnotationMsg with a non-empty string
    const annotationToolbarIdx = src.indexOf("AnnotationToolbar");
    expect(annotationToolbarIdx).toBeGreaterThan(0);
    // Find the nearest onSaved block after AnnotationToolbar
    const onSavedIdx = src.indexOf("onSaved", annotationToolbarIdx);
    expect(onSavedIdx).toBeGreaterThan(annotationToolbarIdx);
    // Use 700 chars — the setAnnotations block is ~300 chars before setSavedAnnotationMsg
    const block = src.slice(onSavedIdx, onSavedIdx + 700);
    expect(block).toMatch(/setSavedAnnotationMsg/);
  });

  it("onSaved handler for QuickHighlightPanel sets a save confirmation message", () => {
    const qhpIdx = src.indexOf("QuickHighlightPanel");
    expect(qhpIdx).toBeGreaterThan(0);
    const onSavedIdx = src.indexOf("onSaved", qhpIdx);
    expect(onSavedIdx).toBeGreaterThan(qhpIdx);
    const block = src.slice(onSavedIdx, onSavedIdx + 700);
    expect(block).toMatch(/setSavedAnnotationMsg/);
  });
});
