/**
 * Static-analysis tests: CTA links in not-found and error pages must have
 * explicit focus-visible ring classes for consistent keyboard focus styling,
 * matching every other interactive element in the app.
 */
import * as fs from "fs";
import * as path from "path";

const appRoot = path.resolve(__dirname, "../app");

describe("Error/NotFound page CTA focus rings", () => {
  it("not-found.tsx Browse books link has focus-visible:ring", () => {
    const src = fs.readFileSync(path.join(appRoot, "not-found.tsx"), "utf-8");
    // Find the Link element with amber-700 background
    const idx = src.indexOf("bg-amber-700");
    expect(idx).toBeGreaterThan(-1);
    const window = src.slice(idx, idx + 200);
    expect(window).toContain("focus-visible:ring");
  });

  it("not-found.tsx Browse books link has focus:outline-none", () => {
    const src = fs.readFileSync(path.join(appRoot, "not-found.tsx"), "utf-8");
    const idx = src.indexOf("bg-amber-700");
    expect(idx).toBeGreaterThan(-1);
    const window = src.slice(idx, idx + 200);
    expect(window).toContain("focus:outline-none");
  });

  it("error.tsx Library link has focus-visible:ring", () => {
    const src = fs.readFileSync(path.join(appRoot, "error.tsx"), "utf-8");
    // Find the Library link (has ArrowLeftIcon and href="/")
    const idx = src.indexOf("border-amber-300");
    expect(idx).toBeGreaterThan(-1);
    const window = src.slice(idx, idx + 200);
    expect(window).toContain("focus-visible:ring");
  });

  it("error.tsx Library link has focus:outline-none", () => {
    const src = fs.readFileSync(path.join(appRoot, "error.tsx"), "utf-8");
    const idx = src.indexOf("border-amber-300");
    expect(idx).toBeGreaterThan(-1);
    const window = src.slice(idx, idx + 200);
    expect(window).toContain("focus:outline-none");
  });
});
