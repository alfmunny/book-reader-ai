import * as fs from "fs";
import * as path from "path";

const src = fs.readFileSync(
  path.join(__dirname, "../components/BookDetailModal.tsx"),
  "utf8"
);

describe("BookDetailModal touch targets (closes #811)", () => {
  it("Close button has aria-label", () => {
    expect(src).toContain('aria-label="Close"');
  });

  it("Close button has min-h-[44px]", () => {
    const idx = src.indexOf('aria-label="Close"');
    expect(idx).toBeGreaterThan(-1);
    const window = src.slice(Math.max(0, idx - 200), idx + 100);
    expect(window).toContain("min-h-[44px]");
  });

  it("Close button has min-w-[44px]", () => {
    const idx = src.indexOf('aria-label="Close"');
    expect(idx).toBeGreaterThan(-1);
    const window = src.slice(Math.max(0, idx - 200), idx + 100);
    expect(window).toContain("min-w-[44px]");
  });

  it("Close button does not use hard-coded w-8 h-8", () => {
    const idx = src.indexOf('aria-label="Close"');
    expect(idx).toBeGreaterThan(-1);
    const window = src.slice(Math.max(0, idx - 200), idx + 100);
    expect(window).not.toMatch(/\bw-8\b/);
    expect(window).not.toMatch(/\bh-8\b/);
  });

  it("Start/Continue Reading CTA button has min-h-[44px]", () => {
    const idx = src.indexOf("Start Reading");
    expect(idx).toBeGreaterThan(-1);
    const window = src.slice(Math.max(0, idx - 300), idx + 20);
    expect(window).toContain("min-h-[44px]");
  });
});
