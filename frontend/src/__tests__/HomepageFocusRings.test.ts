/**
 * Regression tests for #2193: focus-visible rings on homepage (library page) buttons.
 */
import * as fs from "fs";
import * as path from "path";

const src = ["../components/SiteHeader.tsx", "../app/page.tsx", "../app/bookshelf/page.tsx"]
  .map((f) => fs.readFileSync(path.join(__dirname, f), "utf8"))
  .join("\n");

describe("Homepage header buttons focus rings (closes #2193)", () => {
  it("Sign in link (unauthenticated header) has focus ring", () => {
    // Sign in is now a <Link href="/login"> — anchor on href="/login"
    const idx = src.indexOf('href="/login"');
    expect(idx).toBeGreaterThan(-1);
    const window = src.slice(idx, idx + 300);
    expect(window).toContain("focus-visible:ring-amber-400");
  });

  it("Profile avatar link (overflow-hidden) has ring-inset", () => {
    // className comes after aria-label — look forward from first "Profile & Settings"
    const idx = src.indexOf("Profile & Settings");
    expect(idx).toBeGreaterThan(-1);
    const window = src.slice(idx, idx + 430);
    expect(window).toContain("focus-visible:ring-amber-400");
    expect(window).toContain("focus-visible:ring-inset");
  });
});

describe("Primary nav focus rings (closes #2193)", () => {
  it("shared nav link style carries the focus ring", () => {
    // Nav links share a linkClass helper, so the ring lives there rather than
    // beside each href (#2711).
    const idx = src.indexOf("const linkClass");
    expect(idx).toBeGreaterThan(-1);
    const window = src.slice(idx, idx + 500);
    expect(window).toContain("focus-visible:ring-amber-400");
  });

  it("every primary nav destination is rendered through it", () => {
    for (const href of ['href="/"', 'href="/bookshelf"', 'href="/upload"', 'href="/notes"']) {
      expect(src.indexOf(href)).toBeGreaterThan(-1);
    }
    expect(src).toMatch(/className=\{linkClass\(/);
  });
});

describe("Homepage CTA focus rings (closes #2193)", () => {
  it("amber-700 CTA has ring with amber-700 offset", () => {
    // Anchor on the CTA's class signature — the phrase also appears in the
    // empty-state paragraph above it.
    const idx = src.indexOf("bg-amber-700 px-6");
    expect(idx).toBeGreaterThan(-1);
    const window = src.slice(idx, idx + 400);
    expect(window).toContain("focus-visible:ring-amber-400");
    expect(window).toContain("ring-offset-amber-700");
  });

  // The Discover hero buttons, Gutenberg search button, popular-language filter
  // and grid/list toggle were removed with the Discover tab (#2711).
});
