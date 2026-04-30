/**
 * Regression tests for #2535:
 * Home page <section> elements with <h2> headings must have aria-labelledby
 * so they expose as role="region" landmarks (not role="generic") in the
 * accessibility tree, enabling landmark navigation for screen reader users.
 */
import fs from "fs";
import path from "path";

const src = fs.readFileSync(
  path.resolve(__dirname, "..", "app/page.tsx"),
  "utf-8"
);

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
    expect(src).toContain('id="home-continue-reading-heading"');
  });

  it("Continue Reading section has aria-labelledby", () => {
    expect(sectionHasLabelledby("home-continue-reading-heading")).toBe(true);
  });

  it("Your Progress h2 has id attribute", () => {
    expect(headingHasId("Your Progress", "home-progress-heading")).toBe(true);
  });

  it("Your Progress section has aria-labelledby", () => {
    expect(sectionHasLabelledby("home-progress-heading")).toBe(true);
  });

  it("Your Library section has aria-label (conditional h2, no labelledby)", () => {
    expect(src).toContain('aria-label="Your Library"');
  });

  it("Landing hero h2 has id attribute", () => {
    expect(headingHasId("Read the world", "home-hero-heading")).toBe(true);
  });

  it("Landing hero section has aria-labelledby", () => {
    expect(sectionHasLabelledby("home-hero-heading")).toBe(true);
  });

  it("Search h2 has id attribute", () => {
    expect(headingHasId(">Search<", "home-search-heading")).toBe(true);
  });

  it("Search section has aria-labelledby", () => {
    expect(sectionHasLabelledby("home-search-heading")).toBe(true);
  });

  it("Popular Classics h2 has id attribute", () => {
    // Use ">Popular Classics<" to skip the JSX comment "Popular Classics section" on the line above
    expect(headingHasId(">Popular Classics<", "home-popular-heading")).toBe(true);
  });

  it("Popular Classics section has aria-labelledby", () => {
    expect(sectionHasLabelledby("home-popular-heading")).toBe(true);
  });
});
