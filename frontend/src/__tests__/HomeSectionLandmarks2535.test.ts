/**
 * Regression tests for #2535:
 * Home page <section> elements with <h2> headings must have aria-labelledby
 * so they expose as role="region" landmarks (not role="generic") in the
 * accessibility tree, enabling landmark navigation for screen reader users.
 */
import fs from "fs";
import path from "path";

const src = ["../components/SiteHeader.tsx", "../app/(shell)/page.tsx", "../app/(shell)/bookshelf/page.tsx"]
  .map((f) => fs.readFileSync(path.join(__dirname, f), "utf8")).join("\n");

function sectionHasLabelledby(headingId: string): boolean {
  return new RegExp(`aria-labelledby="${headingId}"`).test(src);
}

function headingHasId(text: string, id: string): boolean {
  const idx = src.indexOf(text);
  if (idx === -1) return false;
  const context = src.slice(Math.max(0, idx - 150), idx + 50);
  return context.includes(`id="${id}"`);
}

describe("Home page sections have aria-labelledby for landmark navigation (closes #2535)", () => {
  it("Continue Reading h2 has id attribute", () => {
    // indexOf("Continue Reading") finds the JSX comment first; check for the id directly
    expect(src).toContain('id="bookshelf-continue-reading-heading"');
  });

  it("Continue Reading section has aria-labelledby", () => {
    expect(sectionHasLabelledby("bookshelf-continue-reading-heading")).toBe(true);
  });

  it("Your Progress h2 has id attribute", () => {
    expect(headingHasId("Your Progress", "bookshelf-progress-heading")).toBe(true);
  });

  it("Your Progress section has aria-labelledby", () => {
    expect(sectionHasLabelledby("bookshelf-progress-heading")).toBe(true);
  });

  it("Your Bookshelf section has aria-label (conditional h2, no labelledby)", () => {
    expect(src).toContain('aria-label="Your Bookshelf"');
  });

  it("home catalog h2 has id attribute", () => {
    expect(headingHasId("The Library", "home-catalog-heading")).toBe(true);
  });

  it("home catalog section has aria-labelledby", () => {
    expect(sectionHasLabelledby("home-catalog-heading")).toBe(true);
  });

  // The landing hero, Gutenberg search and Popular Classics sections were
  // removed with the Discover tab (#2711).
});
