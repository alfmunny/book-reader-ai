/**
 * Regression test for #2489:
 * The sidebar resize handle must have a visible focus ring for keyboard users,
 * not just a background color change (WCAG 2.4.7 Focus Visible).
 */
import { readFileSync } from "fs";
import { join } from "path";

const src = readFileSync(
  join(__dirname, "../app/reader/[bookId]/page.tsx"),
  "utf8",
);

describe("Reader page sidebar resize handle focus ring (closes #2489)", () => {
  it("resize handle uses focus-visible:ring for keyboard focus indicator", () => {
    const resizeSection = src.match(/onResizeStart[\s\S]{0,1200}Drag to resize/)?.[0] ?? "";
    expect(resizeSection).toMatch(/focus-visible:ring/);
  });

  it("resize handle does not suppress focus-visible outline without a ring replacement", () => {
    const resizeSection = src.match(/onResizeStart[\s\S]{0,1200}Drag to resize/)?.[0] ?? "";
    // If outline is removed, a ring must be present
    if (resizeSection.includes("focus-visible:outline-none") || resizeSection.includes("focus:outline-none")) {
      expect(resizeSection).toMatch(/focus-visible:ring-\d/);
    }
  });
});
