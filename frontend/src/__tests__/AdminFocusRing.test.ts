import fs from "fs";
import path from "path";

const adminLayout = fs.readFileSync(
  path.resolve(__dirname, "../app/(shell)/admin/layout.tsx"),
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

  it("every admin focusable control has focus-visible:ring-2 (count ≥ 2)", () => {
    // Was ≥ 3 while the layout also rendered a "← Library" back link. That link
    // moved into the global nav when /admin joined the (shell) group, leaving
    // the Refresh button and the section tabs — both still ringed.
    const matches = adminLayout.match(/focus-visible:ring-2/g) ?? [];
    expect(matches.length).toBeGreaterThanOrEqual(2);
  });
});

describe("VocabWordTooltip close button focus ring (closes #2164)", () => {
  it("close button has a focus-visible ring for WCAG 2.4.7", () => {
    expect(vocabTooltip).toMatch(/Close word definition[\s\S]*?focus-visible:ring-2|focus-visible:ring-2[\s\S]*?Close word definition/);
  });
});
