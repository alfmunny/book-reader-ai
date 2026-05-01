/**
 * Regression test for #2607:
 * upload/[bookId]/chapters page shows no feedback when the user removes all chapters.
 * The "Confirm & Start Reading" button silently disables with no message explaining why,
 * leaving the user in a dead-end state.
 *
 * Fix: render an empty-state message in the chapter list when chapters.length === 0.
 */
import * as fs from "fs";
import * as path from "path";

const src = fs.readFileSync(
  path.join(__dirname, "../app/upload/[bookId]/chapters/page.tsx"),
  "utf8",
);

describe("Chapter review empty state (closes #2607)", () => {
  it("renders an explanatory message when chapters list is empty", () => {
    // The source must contain a message that appears when chapters.length === 0
    // to prevent a dead-end state where the confirm button is disabled with no explanation.
    expect(src).toMatch(/chapters\.length\s*===?\s*0.*(?:at least|no chapters|removed all)/is);
  });

  it("empty-state message is inside or near the chapter list area", () => {
    // The empty state must be co-located with the chapter list, not just in a hidden error block.
    // Check that there is a message that renders when chapters array is empty.
    const listIdx = src.indexOf('role="list"');
    expect(listIdx).not.toBe(-1);
    const surroundingBlock = src.slice(listIdx, listIdx + 800);
    // Should have a conditional block showing message when no chapters
    expect(surroundingBlock).toMatch(/chapters\.length\s*===?\s*0|chapters\.length\s*<\s*1/);
  });
});
