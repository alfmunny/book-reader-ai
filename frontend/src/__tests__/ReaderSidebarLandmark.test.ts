import * as fs from "fs";
import * as path from "path";

const src = fs.readFileSync(
  path.join(__dirname, "../app/reader/[bookId]/page.tsx"),
  "utf8"
);

describe("Reader sidebar ARIA landmark (closes #2075)", () => {
  it('sidebar container has role="complementary"', () => {
    expect(src).toContain('role="complementary"');
  });

  it("sidebar container has an aria-label", () => {
    const idx = src.indexOf('role="complementary"');
    expect(idx).toBeGreaterThan(-1);
    const window = src.slice(Math.max(0, idx - 50), idx + 300);
    expect(window).toMatch(/aria-label=/);
  });

  it("sidebar aria-label references sidebarTab for dynamic naming", () => {
    const idx = src.indexOf('role="complementary"');
    expect(idx).toBeGreaterThan(-1);
    const window = src.slice(Math.max(0, idx - 50), idx + 300);
    expect(window).toContain("sidebarTab");
  });
});
