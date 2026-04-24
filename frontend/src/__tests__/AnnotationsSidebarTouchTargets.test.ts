import * as fs from "fs";
import * as path from "path";

const src = fs.readFileSync(
  path.join(__dirname, "../components/AnnotationsSidebar.tsx"),
  "utf8"
);

describe("AnnotationsSidebar touch targets (closes #806)", () => {
  it("Close button has min-h-[44px]", () => {
    const idx = src.indexOf('aria-label="Close"');
    expect(idx).toBeGreaterThan(-1);
    const window = src.slice(Math.max(0, idx - 300), idx + 100);
    expect(window).toContain("min-h-[44px]");
  });

  it("Close button has min-w-[44px]", () => {
    const idx = src.indexOf('aria-label="Close"');
    expect(idx).toBeGreaterThan(-1);
    const window = src.slice(Math.max(0, idx - 300), idx + 100);
    expect(window).toContain("min-w-[44px]");
  });

  it("Edit annotation button has min-h-[44px]", () => {
    const idx = src.indexOf('aria-label="Edit annotation"');
    expect(idx).toBeGreaterThan(-1);
    const window = src.slice(Math.max(0, idx - 300), idx + 100);
    expect(window).toContain("min-h-[44px]");
  });

  it("Edit annotation button has min-w-[44px]", () => {
    const idx = src.indexOf('aria-label="Edit annotation"');
    expect(idx).toBeGreaterThan(-1);
    const window = src.slice(Math.max(0, idx - 300), idx + 100);
    expect(window).toContain("min-w-[44px]");
  });
});
