import * as fs from "fs";
import * as path from "path";

const src = fs.readFileSync(
  path.join(__dirname, "../app/admin/books/page.tsx"),
  "utf8"
);

describe("admin/books page touch targets (closes #867)", () => {
  it("Import Book button has min-h-[44px]", () => {
    const idx = src.indexOf("handleImport}");
    expect(idx).toBeGreaterThan(-1);
    const window = src.slice(idx, idx + 200);
    expect(window).toContain("min-h-[44px]");
  });

  it("book expand/collapse chevron button has min-h-[44px]", () => {
    // anchor on setExpandedBookId to find the outer expand button
    const idx = src.indexOf("setExpandedBookId(isExpanded");
    expect(idx).toBeGreaterThan(-1);
    const window = src.slice(idx, idx + 300);
    expect(window).toContain("min-h-[44px]");
  });

  it("Retry failed chapters button has min-h-[44px]", () => {
    // use onClick context to find the button (not the function definition)
    // title/aria-label template literals are ~400 chars before className
    const idx = src.indexOf("onClick={() => retryFailedForLang(");
    expect(idx).toBeGreaterThan(-1);
    const window = src.slice(idx, idx + 600);
    expect(window).toContain("min-h-[44px]");
  });

  it("Open reader button has min-h-[44px]", () => {
    const idx = src.indexOf('router.push(`/reader/${b.id}`)');
    expect(idx).toBeGreaterThan(-1);
    const window = src.slice(idx, idx + 200);
    expect(window).toContain("min-h-[44px]");
  });

  it("language expand/collapse button has min-h-[44px]", () => {
    const idx = src.indexOf("setExpandedLang(isLangExpanded");
    expect(idx).toBeGreaterThan(-1);
    const window = src.slice(idx, idx + 200);
    expect(window).toContain("min-h-[44px]");
  });
});
