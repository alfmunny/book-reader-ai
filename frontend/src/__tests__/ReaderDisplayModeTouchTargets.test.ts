import * as fs from "fs";
import * as path from "path";

const src = fs.readFileSync(
  path.join(__dirname, "../app/reader/[bookId]/page.tsx"),
  "utf8"
);

// The sidebar display mode buttons appear before the mobile toolbar ones.
// Both Inline and Side by side occur in sequence — check the first pair.
function checkForward(anchor: string, radius = 200): void {
  const idx = src.indexOf(anchor);
  expect(idx).toBeGreaterThan(-1);
  const window = src.slice(idx, idx + radius);
  expect(window).toContain("min-h-[44px]");
}

describe("reader sidebar display-mode button touch targets (closes #876)", () => {
  it("sidebar Inline button has min-h-[44px]", () => {
    // First occurrence of setDisplayMode("inline") is in the sidebar
    checkForward('setDisplayMode("inline")');
  });

  it("sidebar Side by side button has min-h-[44px]", () => {
    // First occurrence of setDisplayMode("parallel") is in the sidebar
    checkForward('setDisplayMode("parallel")');
  });
});
