/**
 * Static assertions: app/error.tsx renders themed fallback with reset CTA.
 * Closes #1169
 */
import fs from "fs";
import path from "path";

const errorPath = path.join(process.cwd(), "src/app/error.tsx");

describe("Custom error page", () => {
  it("file exists at app/error.tsx", () => {
    expect(fs.existsSync(errorPath)).toBe(true);
  });

  it('is marked "use client"', () => {
    const src = fs.readFileSync(errorPath, "utf8");
    expect(src).toMatch(/^"use client"/);
  });

  it("uses bg-parchment for theme consistency", () => {
    const src = fs.readFileSync(errorPath, "utf8");
    expect(src).toContain("bg-parchment");
  });

  it("has Something went wrong heading", () => {
    const src = fs.readFileSync(errorPath, "utf8");
    expect(src).toMatch(/<h1[^>]*>\s*Something went wrong/);
  });

  it("calls reset() in a Try again button", () => {
    const src = fs.readFileSync(errorPath, "utf8");
    expect(src).toMatch(/onClick=\{[^}]*reset\(\)/);
    expect(src).toMatch(/Try again/);
  });

  it("links back to library", () => {
    const src = fs.readFileSync(errorPath, "utf8");
    expect(src).toMatch(/href="\/"/);
  });

  it("has role=alert on the error block", () => {
    const src = fs.readFileSync(errorPath, "utf8");
    expect(src).toContain('role="alert"');
  });
});
