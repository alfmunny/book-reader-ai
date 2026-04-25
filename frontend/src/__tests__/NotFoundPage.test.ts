/**
 * Static assertions: app/not-found.tsx renders themed 404 with CTA to library.
 * Closes #1167
 */
import fs from "fs";
import path from "path";

const notFoundPath = path.join(process.cwd(), "src/app/not-found.tsx");

describe("Custom 404 page", () => {
  it("file exists at app/not-found.tsx", () => {
    expect(fs.existsSync(notFoundPath)).toBe(true);
  });

  it("uses bg-parchment for theme consistency", () => {
    const src = fs.readFileSync(notFoundPath, "utf8");
    expect(src).toContain("bg-parchment");
  });

  it("has Page not found heading", () => {
    const src = fs.readFileSync(notFoundPath, "utf8");
    expect(src).toMatch(/<h1[^>]*>\s*Page not found/);
  });

  it("links back to library", () => {
    const src = fs.readFileSync(notFoundPath, "utf8");
    expect(src).toMatch(/href="\/"/);
    expect(src).toMatch(/Browse books|Back to library|Library/);
  });
});
