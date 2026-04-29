import fs from "fs";
import path from "path";

const adminLayout = fs.readFileSync(
  path.resolve(__dirname, "../app/admin/layout.tsx"),
  "utf8",
);

const vocabTooltip = fs.readFileSync(
  path.resolve(__dirname, "../components/VocabWordTooltip.tsx"),
  "utf8",
);

describe("admin layout button focus rings (closes #2164)", () => {
  it("Library back button has a focus-visible ring for WCAG 2.4.7", () => {
    expect(adminLayout).toMatch(/router\.push\("\/"\)[\s\S]*?focus-visible:ring-2|focus-visible:ring-2[\s\S]*?router\.push\("\/"\)/);
  });

  it("Refresh button has a focus-visible ring for WCAG 2.4.7", () => {
    expect(adminLayout).toMatch(/loadStats[\s\S]*?focus-visible:ring-2|focus-visible:ring-2[\s\S]*?loadStats/);
  });

  it("admin nav tabs (Links) have a focus-visible ring for WCAG 2.4.7", () => {
    expect(adminLayout).toMatch(/TABS\.map[\s\S]*?focus-visible:ring-2/);
  });

  it("all three admin focusable controls have focus-visible:ring-2 (count ≥ 3)", () => {
    const matches = adminLayout.match(/focus-visible:ring-2/g) ?? [];
    expect(matches.length).toBeGreaterThanOrEqual(3);
  });
});

describe("VocabWordTooltip close button focus ring (closes #2164)", () => {
  it("close button has a focus-visible ring for WCAG 2.4.7", () => {
    expect(vocabTooltip).toMatch(/Close word definition[\s\S]*?focus-visible:ring-2|focus-visible:ring-2[\s\S]*?Close word definition/);
  });
});
