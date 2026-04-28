/**
 * Regression test for #1932:
 * AnnotationsSidebar empty state must include a font-serif headline.
 */
import { readFileSync } from "fs";
import { join } from "path";

const src = readFileSync(
  join(__dirname, "../components/AnnotationsSidebar.tsx"),
  "utf8",
);

// Capture the empty-state branch: from `annotations.length === 0` to the
// closing of that branch (the else case opens with a fragment `<>`).
const emptyBlock =
  src.match(/annotations\.length === 0[\s\S]{0,600}mt-1 text-xs/)?.[0] ?? "";

describe("AnnotationsSidebar empty state (closes #1932)", () => {
  it("empty-state block is found in source", () => {
    expect(emptyBlock.length).toBeGreaterThan(0);
  });

  it("empty state has a font-serif headline", () => {
    expect(emptyBlock).toMatch(/font-serif/);
  });

  it("empty state has EmptyNotesIcon", () => {
    expect(emptyBlock).toMatch(/EmptyNotesIcon/);
  });
});
