import fs from "fs";
import path from "path";

const src = fs.readFileSync(
  path.resolve(__dirname, "../components/AnnotationToolbar.tsx"),
  "utf8",
);

describe("AnnotationToolbar button focus rings (closes #2168)", () => {
  it("close button has focus-visible:ring-2 for WCAG 2.4.7", () => {
    expect(src).toMatch(/Close note editor[\s\S]*?focus-visible:ring-2|focus-visible:ring-2[\s\S]*?Close note editor/);
  });

  it("color radio buttons have focus-visible:ring-2 for WCAG 2.4.7", () => {
    expect(src).toMatch(/role="radio"[\s\S]*?focus-visible:ring-2|focus-visible:ring-2[\s\S]*?role="radio"/);
  });

  it("save button has focus-visible:ring-2 for WCAG 2.4.7", () => {
    expect(src).toMatch(/handleSave[\s\S]*?focus-visible:ring-2|focus-visible:ring-2[\s\S]*?handleSave/);
  });

  it("delete button has focus-visible:ring-2 for WCAG 2.4.7", () => {
    expect(src).toMatch(/Delete note[\s\S]*?focus-visible:ring-2|focus-visible:ring-2[\s\S]*?Delete note/);
  });

  it("all four AnnotationToolbar buttons use focus-visible:ring-2 (count ≥ 4)", () => {
    const matches = src.match(/focus-visible:ring-2/g) ?? [];
    expect(matches.length).toBeGreaterThanOrEqual(4);
  });
});
