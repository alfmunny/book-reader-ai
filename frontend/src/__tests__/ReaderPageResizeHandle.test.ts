/**
 * Regression test for #1915:
 * The sidebar resize handle must be keyboard-accessible with proper ARIA attributes.
 */
import { readFileSync } from "fs";
import { join } from "path";

const src = readFileSync(
  join(__dirname, "../app/reader/[bookId]/page.tsx"),
  "utf8",
);

describe("Reader page sidebar resize handle accessibility (closes #1915)", () => {
  it("resize handle has role separator", () => {
    expect(src).toMatch(/role="separator"/);
  });

  it("resize handle has aria-label", () => {
    expect(src).toMatch(/aria-label="Resize reader sidebar"/);
  });

  it("resize handle has tabIndex for keyboard focus", () => {
    // tabIndex={0} makes it reachable via keyboard Tab
    const resizeSection = src.match(/onResizeStart[\s\S]{0,1200}Drag to resize/)?.[0] ?? "";
    expect(resizeSection).toMatch(/tabIndex=\{0\}/);
  });

  it("resize handle has onKeyDown for arrow-key resizing", () => {
    const resizeSection = src.match(/onResizeStart[\s\S]{0,1200}Drag to resize/)?.[0] ?? "";
    expect(resizeSection).toMatch(/onKeyDown=/);
  });
});
