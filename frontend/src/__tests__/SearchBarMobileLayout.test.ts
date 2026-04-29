/**
 * Regression test for #2208: SearchBar expanded form must not use a fixed
 * min-width on the input that forces horizontal overflow on narrow mobile screens.
 */
import * as fs from "fs";
import * as path from "path";

const src = fs.readFileSync(
  path.join(__dirname, "../components/SearchBar.tsx"),
  "utf8"
);

describe("SearchBar mobile layout (closes #2208)", () => {
  it("input does not use fixed min-w-[14rem] that overflows narrow screens", () => {
    expect(src).not.toContain("min-w-[14rem]");
  });

  it("input uses flex-1 so it grows within available container space", () => {
    const idx = src.indexOf("placeholder:text-stone-600");
    expect(idx).toBeGreaterThan(-1);
    const window = src.slice(Math.max(0, idx - 200), idx + 30);
    expect(window).toContain("flex-1");
  });
});
