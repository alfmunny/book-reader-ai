/**
 * Static-analysis tests: admin error-state Retry buttons must use
 * min-h-[44px] md:min-h-0 (not bare min-h-[36px]) for mobile touch targets.
 */
import * as fs from "fs";
import * as path from "path";

function src(file: string) {
  return fs.readFileSync(path.resolve(__dirname, "../app", file), "utf-8");
}

describe("Admin Retry button touch targets", () => {
  it("admin/uploads/page.tsx error Retry button uses min-h-[44px], not min-h-[36px]", () => {
    const content = src("admin/uploads/page.tsx");
    // Anchor on the border-red-300 class which appears only on the Retry button
    const idx = content.indexOf("border-red-300 text-red-700");
    expect(idx).toBeGreaterThan(-1);
    const window = content.slice(Math.max(0, idx - 50), idx + 200);
    expect(window).not.toContain("min-h-[36px]");
    expect(window).toContain("min-h-[44px]");
  });

  it("admin/uploads/page.tsx error Retry button uses md:min-h-0", () => {
    const content = src("admin/uploads/page.tsx");
    const idx = content.indexOf("border-red-300 text-red-700");
    const window = content.slice(Math.max(0, idx - 50), idx + 200);
    expect(window).toContain("md:min-h-0");
  });

  it("admin/books/page.tsx has no bare min-h-[36px] touch targets", () => {
    const content = src("admin/books/page.tsx");
    expect(content).not.toContain("min-h-[36px]");
  });
});
