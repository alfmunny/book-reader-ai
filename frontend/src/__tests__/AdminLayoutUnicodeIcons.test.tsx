/**
 * Verifies admin layout header buttons use SVG icons instead of Unicode characters.
 * Issue #650: ← and ↻ characters used as UI icons.
 */
import fs from "fs";
import path from "path";

const layoutPath = path.join(
  __dirname,
  "../../src/app/admin/layout.tsx"
);

const source = fs.readFileSync(layoutPath, "utf-8");

describe("admin/layout.tsx icon system compliance", () => {
  it("does not use ← Unicode arrow character as a UI icon", () => {
    expect(source).not.toContain("← Library");
    expect(source).not.toContain("←");
  });

  it("does not use ↻ Unicode refresh character as a UI icon", () => {
    expect(source).not.toContain("↻ Refresh");
    expect(source).not.toContain("↻");
  });

  it("imports ArrowLeftIcon from Icons", () => {
    expect(source).toMatch(/ArrowLeftIcon/);
  });

  it("imports RetryIcon from Icons", () => {
    expect(source).toMatch(/RetryIcon/);
  });
});
