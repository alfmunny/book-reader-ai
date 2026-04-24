import * as fs from "fs";
import * as path from "path";

const src = fs.readFileSync(
  path.join(__dirname, "../app/admin/uploads/page.tsx"),
  "utf8"
);

describe("admin/uploads page touch targets (closes #861)", () => {
  it("Filter button has min-h-[44px]", () => {
    const idx = src.indexOf("handleFilter}");
    expect(idx).toBeGreaterThan(-1);
    const window = src.slice(idx, idx + 200);
    expect(window).toContain("min-h-[44px]");
  });

  it("Clear filter button has min-h-[44px]", () => {
    const idx = src.indexOf("clearFilter}");
    expect(idx).toBeGreaterThan(-1);
    const window = src.slice(idx, idx + 200);
    expect(window).toContain("min-h-[44px]");
  });

  it("Open (row) button has min-h-[44px]", () => {
    // anchor on the reader push inside onClick
    const idx = src.indexOf("router.push(`/reader/");
    expect(idx).toBeGreaterThan(-1);
    const window = src.slice(idx, idx + 200);
    expect(window).toContain("min-h-[44px]");
  });
});
