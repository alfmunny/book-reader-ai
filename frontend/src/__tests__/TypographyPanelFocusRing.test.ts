import fs from "fs";
import path from "path";

const src = fs.readFileSync(
  path.resolve(__dirname, "../components/TypographyPanel.tsx"),
  "utf8",
);

describe("TypographyPanel focus rings (closes #2166)", () => {
  it("segmented-control buttons include focus-visible:ring-2 for WCAG 2.4.7", () => {
    expect(src).toMatch(/aria-pressed[\s\S]*?focus-visible:ring-2|focus-visible:ring-2[\s\S]*?aria-pressed/);
  });

  it("toggle switch button includes focus-visible:ring-2 for WCAG 2.4.7", () => {
    expect(src).toMatch(/role="switch"[\s\S]*?focus-visible:ring-2|focus-visible:ring-2[\s\S]*?role="switch"/);
  });

  it("does not silently suppress focus with only outline-none (no ring)", () => {
    const outlineOnlyNoRing = /focus:outline-none(?![^"']*focus-visible:ring)/;
    expect(src).not.toMatch(outlineOnlyNoRing);
  });
});
