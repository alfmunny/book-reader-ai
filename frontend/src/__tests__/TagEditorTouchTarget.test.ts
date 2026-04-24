import * as fs from "fs";
import * as path from "path";

const src = fs.readFileSync(
  path.join(__dirname, "../components/TagEditor.tsx"),
  "utf8"
);

describe("TagEditor remove-tag touch target (closes #827)", () => {
  it("remove-tag button has min-h-[44px]", () => {
    const idx = src.indexOf("Remove tag");
    expect(idx).toBeGreaterThan(-1);
    const window = src.slice(Math.max(0, idx - 200), idx + 100);
    expect(window).toContain("min-h-[44px]");
  });

  it("remove-tag button has min-w-[44px]", () => {
    const idx = src.indexOf("Remove tag");
    expect(idx).toBeGreaterThan(-1);
    const window = src.slice(Math.max(0, idx - 200), idx + 100);
    expect(window).toContain("min-w-[44px]");
  });
});
