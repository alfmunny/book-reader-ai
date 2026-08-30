import * as fs from "fs";
import * as path from "path";

const src = ["../components/SiteHeader.tsx", "../app/(shell)/page.tsx", "../app/(shell)/bookshelf/page.tsx"]
  .map((f) => fs.readFileSync(path.join(__dirname, f), "utf8"))
  .join("\n");

function checkAround(anchor: string, radius = 200): void {
  const idx = src.indexOf(anchor);
  expect(idx).toBeGreaterThan(-1);
  const window = src.slice(Math.max(0, idx - radius), idx + radius);
  expect(window).toContain("min-h-[44px]");
}

describe("Home page tab-nav and CTA touch targets (closes #853)", () => {
  it("primary nav links have min-h-[44px]", () => {
    // Nav links share a linkClass helper, so the size lives there (#2711).
    const idx = src.indexOf("const linkClass");
    expect(idx).toBeGreaterThan(-1);
    expect(src.slice(idx, idx + 500)).toContain("min-h-[44px]");
  });

  it("Upload and Notes links go through the shared nav style", () => {
    for (const href of ['href="/upload"', 'href="/notes"']) {
      const idx = src.indexOf(href);
      expect(idx).toBeGreaterThan(-1);
      expect(src.slice(idx, idx + 120)).toContain("linkClass(");
    }
  });

  it("empty-bookshelf CTA has min-h-[44px]", () => {
    checkAround("Browse the library", 400);
  });

  it("Sign in header link has min-h-[44px]", () => {
    checkAround('href="/login"', 320);
  });

  // The Discover hero CTAs and the Gutenberg search button went with the search
  // itself (#2711); the remaining CTAs on this surface are covered above.
});
