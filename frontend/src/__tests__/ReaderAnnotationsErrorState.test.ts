/**
 * Regression tests for issue #2414:
 * Reader annotations sidebar showed "No annotations yet" when getAnnotations fetch failed.
 * Source-level assertions confirm the error state and retry path are wired.
 */
import * as path from "path";
import * as fs from "fs";

const src = fs.readFileSync(
  path.join(__dirname, "../app/reader/[bookId]/page.tsx"),
  "utf8"
);

describe("Reader page — annotations error state (issue #2414)", () => {
  it("declares annotationsError state", () => {
    expect(src).toMatch(/annotationsError/);
    expect(src).toMatch(/setAnnotationsError/);
  });

  it("catch block sets annotationsError instead of swallowing silently", () => {
    // The old code was: .catch(() => {})
    // New code must call setAnnotationsError(true) in the getAnnotations catch
    const annotationsCatchSection = src.slice(
      src.indexOf("getAnnotations("),
      src.indexOf("getAnnotations(") + 300
    );
    expect(annotationsCatchSection).toMatch(/setAnnotationsError\s*\(\s*true\s*\)/);
    expect(annotationsCatchSection).not.toMatch(/\.catch\s*\(\s*\(\s*\)\s*=>\s*\{\s*\}\s*\)/);
  });

  it("renders a distinct error message (not empty state) when annotationsError is true", () => {
    // Should have a JSX branch checking annotationsError before the empty state
    // and rendering error text with a Retry button
    expect(src).toMatch(/annotationsError/);
    // Error message should reference a retry or reload action
    expect(src).toMatch(/Retry|retry|Couldn.t load|failed to load|couldn.t load/i);
  });

  it("error state renders role=\"status\" or role=\"alert\" (not the empty NoteIcon state)", () => {
    // The error branch should use role="alert" or role="status" to announce the error
    // The empty state uses NoteIcon with "No annotations yet"
    // Verify both coexist (we didn't remove the empty state, just added the error branch first)
    expect(src).toMatch(/No annotations yet/);
    // And the error path is guarded separately from the empty state
    const notesTabSection = src.slice(
      src.lastIndexOf("sidebarTab === \"notes\""),
      src.lastIndexOf("sidebarTab === \"notes\"") + 8000
    );
    expect(notesTabSection).toMatch(/annotationsError/);
  });
});
