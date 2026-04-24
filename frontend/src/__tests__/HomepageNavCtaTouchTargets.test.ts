import * as fs from "fs";
import * as path from "path";

const src = fs.readFileSync(
  path.join(__dirname, "../app/page.tsx"),
  "utf8"
);

function checkAround(anchor: string, radius = 200): void {
  const idx = src.indexOf(anchor);
  expect(idx).toBeGreaterThan(-1);
  const window = src.slice(Math.max(0, idx - radius), idx + radius);
  expect(window).toContain("min-h-[44px]");
}

describe("Home page tab-nav and CTA touch targets (closes #853)", () => {
  it("tab navigation buttons have min-h-[44px]", () => {
    checkAround("setTab(key)");
  });

  it("Upload tab button has min-h-[44px]", () => {
    checkAround('router.push("/upload")');
  });

  it("Notes tab button has min-h-[44px]", () => {
    checkAround('router.push("/notes")');
  });

  it("Discover Books CTA has min-h-[44px]", () => {
    checkAround("Discover Books");
  });

  it("Sign in free hero CTA has min-h-[44px]", () => {
    checkAround("Sign in free");
  });

  it("Browse library hero CTA has min-h-[44px]", () => {
    checkAround("Browse library");
  });

  it("Search button has min-h-[44px]", () => {
    // anchor on searching state text, className is nearby
    const idx = src.indexOf('"Searching" : "Search"');
    expect(idx).toBeGreaterThan(-1);
    const window = src.slice(Math.max(0, idx - 550), idx + 20);
    expect(window).toContain("min-h-[44px]");
  });
});
