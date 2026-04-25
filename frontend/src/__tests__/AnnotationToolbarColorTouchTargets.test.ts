import * as fs from "fs";
import * as path from "path";

const src = fs.readFileSync(
  path.join(__dirname, "../components/AnnotationToolbar.tsx"),
  "utf8"
);

describe("AnnotationToolbar color picker touch targets (closes #826)", () => {
  it("color button wrapper has min-h-[44px]", () => {
    const idx = src.indexOf("Highlight colour");
    expect(idx).toBeGreaterThan(-1);
    const window = src.slice(idx, idx + 600);
    expect(window).toContain("min-h-[44px]");
  });

  it("color button wrapper has min-w-[44px]", () => {
    const idx = src.indexOf("Highlight colour");
    expect(idx).toBeGreaterThan(-1);
    const window = src.slice(idx, idx + 600);
    expect(window).toContain("min-w-[44px]");
  });

  it("visual circle swatch stays w-8 h-8", () => {
    const idx = src.indexOf("Highlight colour");
    expect(idx).toBeGreaterThan(-1);
    const window = src.slice(idx, idx + 1000);
    expect(window).toContain("w-8 h-8");
  });
});
