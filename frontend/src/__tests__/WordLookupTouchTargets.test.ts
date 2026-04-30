/**
 * Regression tests for #2348: WordLookup close button and WordActionDrawer
 * retry button had touch targets below 44px on mobile (WCAG 2.5.5).
 */
import * as fs from "fs";
import * as path from "path";

const lookupSrc = fs.readFileSync(
  path.join(__dirname, "../components/WordLookup.tsx"),
  "utf8",
);
const drawerSrc = fs.readFileSync(
  path.join(__dirname, "../components/WordActionDrawer.tsx"),
  "utf8",
);

describe("WordLookup close button touch target (closes #2348)", () => {
  it("has min-h-[44px] for mobile touch target", () => {
    const idx = lookupSrc.indexOf('aria-label="Close definition"');
    expect(idx).toBeGreaterThan(-1);
    const window = lookupSrc.slice(idx, idx + 200);
    expect(window).toContain("min-h-[44px]");
  });

  it("has md:min-h-0 to keep desktop compact", () => {
    const idx = lookupSrc.indexOf('aria-label="Close definition"');
    expect(idx).toBeGreaterThan(-1);
    const window = lookupSrc.slice(idx, idx + 200);
    expect(window).toContain("md:min-h-0");
  });

  it("has min-w-[44px] for mobile touch target", () => {
    const idx = lookupSrc.indexOf('aria-label="Close definition"');
    expect(idx).toBeGreaterThan(-1);
    const window = lookupSrc.slice(idx, idx + 200);
    expect(window).toContain("min-w-[44px]");
  });

  it("has flex items-center justify-center for proper sizing", () => {
    const idx = lookupSrc.indexOf('aria-label="Close definition"');
    expect(idx).toBeGreaterThan(-1);
    const window = lookupSrc.slice(idx, idx + 280);
    expect(window).toContain("flex items-center justify-center");
  });
});

describe("WordActionDrawer retry button touch target (closes #2348)", () => {
  it("has min-h-[44px] for mobile touch target", () => {
    const idx = drawerSrc.indexOf('aria-label="Retry dictionary lookup"');
    expect(idx).toBeGreaterThan(-1);
    const window = drawerSrc.slice(idx, idx + 200);
    expect(window).toContain("min-h-[44px]");
  });

  it("has md:min-h-0 to keep desktop compact", () => {
    const idx = drawerSrc.indexOf('aria-label="Retry dictionary lookup"');
    expect(idx).toBeGreaterThan(-1);
    const window = drawerSrc.slice(idx, idx + 200);
    expect(window).toContain("md:min-h-0");
  });

  it("has min-w-[44px] for mobile touch target", () => {
    const idx = drawerSrc.indexOf('aria-label="Retry dictionary lookup"');
    expect(idx).toBeGreaterThan(-1);
    const window = drawerSrc.slice(idx, idx + 200);
    expect(window).toContain("min-w-[44px]");
  });
});
