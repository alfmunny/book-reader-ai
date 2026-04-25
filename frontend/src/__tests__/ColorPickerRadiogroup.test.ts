/**
 * Static assertion: AnnotationToolbar color picker uses radiogroup pattern.
 * Closes #1147
 */
import fs from "fs";
import path from "path";

const toolbar = fs.readFileSync(
  path.join(process.cwd(), "src/components/AnnotationToolbar.tsx"),
  "utf8",
);

describe("AnnotationToolbar color picker radiogroup", () => {
  it("color picker wrapper has role=radiogroup", () => {
    expect(toolbar).toContain('role="radiogroup"');
  });

  it("color picker wrapper has aria-label", () => {
    expect(toolbar).toMatch(/aria-label="Highlight colour"/);
  });

  it("each color button has role=radio", () => {
    expect(toolbar).toContain('role="radio"');
  });

  it("each color button uses aria-checked instead of aria-pressed", () => {
    expect(toolbar).toContain("aria-checked={color === c.key}");
    // Old aria-pressed should be removed
    expect(toolbar).not.toContain("aria-pressed={color === c.key}");
  });
});
