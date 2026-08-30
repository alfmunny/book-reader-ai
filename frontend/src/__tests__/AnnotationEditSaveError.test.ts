/**
 * Source-level regression tests for annotation edit save-error state (issue #2433).
 */
import fs from "fs";
import path from "path";

const SOURCE = fs.readFileSync(
  path.resolve(__dirname, "../app/(shell)/notes/[bookId]/page.tsx"),
  "utf8"
);

describe("Notes page — annotation edit save-error state (issue #2433)", () => {
  it("declares editSaveError state", () => {
    expect(SOURCE).toMatch(/editSaveError/);
  });

  it("sets editSaveError true in saveEdit catch block", () => {
    const saveIdx = SOURCE.indexOf("async function saveEdit");
    expect(saveIdx).toBeGreaterThan(-1);
    const snippet = SOURCE.slice(saveIdx, saveIdx + 400);
    expect(snippet).toMatch(/setEditSaveError\(true\)/);
  });

  it("clears editSaveError at the start of saveEdit", () => {
    const saveIdx = SOURCE.indexOf("async function saveEdit");
    const snippet = SOURCE.slice(saveIdx, saveIdx + 400);
    expect(snippet).toMatch(/setEditSaveError\(false\)/);
  });

  it("passes saveError prop to AnnotationCard", () => {
    expect(SOURCE).toMatch(/saveError=\{editSaveError\}/);
  });

  it("renders error message when saveError is true in AnnotationCard", () => {
    expect(SOURCE).toMatch(/saveError.*Couldn.*t save/s);
  });
});
