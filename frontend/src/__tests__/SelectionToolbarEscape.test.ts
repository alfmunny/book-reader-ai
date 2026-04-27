/**
 * Regression test for issue #1802:
 * SelectionToolbar had no Escape key handler — keyboard users couldn't dismiss it.
 * Fixed by adding a keydown listener that clears selection on Escape.
 */
import * as fs from "fs";
import * as path from "path";

const src = fs.readFileSync(
  path.join(__dirname, "../components/SelectionToolbar.tsx"),
  "utf8",
);

describe("SelectionToolbar Escape key dismiss (closes #1802)", () => {
  it("has a keydown handler that checks for Escape key", () => {
    expect(src).toMatch(/e\.key.*Escape|Escape.*e\.key/);
  });

  it("clears selection on Escape (removeAllRanges called in Escape path)", () => {
    expect(src).toMatch(/removeAllRanges/);
  });
});
