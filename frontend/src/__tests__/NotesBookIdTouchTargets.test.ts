import * as fs from "fs";
import * as path from "path";

const src = fs.readFileSync(
  path.join(__dirname, "../app/(shell)/notes/[bookId]/page.tsx"),
  "utf8"
);

describe("notes/[bookId] page touch targets (closes #849)", () => {
  it("section collapse toggle button has min-h-[44px]", () => {
    // className comes after onClick in the JSX — check a forward window
    const idx = src.indexOf("onClick={onToggle}");
    expect(idx).toBeGreaterThan(-1);
    const window = src.slice(idx, idx + 200);
    expect(window).toContain("min-h-[44px]");
  });

  it("insight delete button has min-h-[44px]", () => {
    const idx = src.indexOf("Delete insight");
    expect(idx).toBeGreaterThan(-1);
    const window = src.slice(Math.max(0, idx - 300), idx + 20);
    expect(window).toContain("min-h-[44px]");
  });

  it("back to Notes header link has min-h-[44px]", () => {
    // back to Notes is now a <Link href="/notes"> — anchor on href="/notes"
    const idx = src.indexOf('href="/notes"');
    expect(idx).toBeGreaterThan(-1);
    const window = src.slice(idx, idx + 200);
    expect(window).toContain("min-h-[44px]");
  });

  it("empty-state Open reader link has min-h-[44px]", () => {
    const idx = src.indexOf("Open reader");
    expect(idx).toBeGreaterThan(-1);
    const window = src.slice(Math.max(0, idx - 350), idx + 20);
    expect(window).toContain("min-h-[44px]");
  });
});
