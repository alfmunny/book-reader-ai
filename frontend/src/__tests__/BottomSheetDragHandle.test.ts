/**
 * Regression tests for bottom-sheet drag handle alignment (closes #2377).
 *
 * The drag handle pill must be centered in the drawer header. Using
 * `justify-between` with `mx-auto` on a two-item flex row doesn't center
 * anything — `justify-between` overrides `mx-auto`. The fix is a
 * `justify-center` container with the close button positioned absolutely.
 */
import * as fs from "fs";
import * as path from "path";

const wordDrawerSrc = fs.readFileSync(
  path.join(__dirname, "../components/WordActionDrawer.tsx"),
  "utf8",
);

const vocabPageSrc = fs.readFileSync(
  path.join(__dirname, "../app/(shell)/vocabulary/page.tsx"),
  "utf8",
);

describe("WordActionDrawer drag handle is centered (closes #2377)", () => {
  it("drag handle container uses justify-center, not justify-between", () => {
    // Find the block that contains the drag handle pill
    const pillIdx = wordDrawerSrc.indexOf("bg-amber-200 rounded-full");
    expect(pillIdx).toBeGreaterThan(-1);
    // Look at the surrounding 200 chars for the container class
    const block = wordDrawerSrc.slice(Math.max(0, pillIdx - 200), pillIdx + 50);
    expect(block).toMatch(/justify-center/);
    expect(block).not.toMatch(/justify-between/);
  });

  it("drag handle pill does NOT have mx-auto (which has no effect in justify-center)", () => {
    const pillIdx = wordDrawerSrc.indexOf("bg-amber-200 rounded-full");
    const pillLine = wordDrawerSrc.slice(pillIdx - 10, pillIdx + 60);
    expect(pillLine).not.toMatch(/mx-auto/);
  });

  it("close button uses absolute positioning to stay right-aligned", () => {
    const pillIdx = wordDrawerSrc.indexOf("bg-amber-200 rounded-full");
    // Close button appears after the pill in the source
    const block = wordDrawerSrc.slice(pillIdx, pillIdx + 400);
    expect(block).toMatch(/absolute/);
  });
});

describe("DefinitionSheet drag handle is centered (closes #2377)", () => {
  it("drag handle container uses justify-center, not justify-between", () => {
    const pillIdx = vocabPageSrc.indexOf("bg-amber-200 rounded-full");
    expect(pillIdx).toBeGreaterThan(-1);
    const block = vocabPageSrc.slice(Math.max(0, pillIdx - 200), pillIdx + 50);
    expect(block).toMatch(/justify-center/);
    expect(block).not.toMatch(/justify-between/);
  });

  it("drag handle pill does NOT have mx-auto", () => {
    const pillIdx = vocabPageSrc.indexOf("bg-amber-200 rounded-full");
    const pillLine = vocabPageSrc.slice(pillIdx - 10, pillIdx + 60);
    expect(pillLine).not.toMatch(/mx-auto/);
  });

  it("close button uses absolute positioning to stay right-aligned", () => {
    const pillIdx = vocabPageSrc.indexOf("bg-amber-200 rounded-full");
    const block = vocabPageSrc.slice(pillIdx, pillIdx + 400);
    expect(block).toMatch(/absolute/);
  });
});
