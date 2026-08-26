/**
 * Regression tests for #2340: home page and admin books search live regions
 * must use the always-present pattern (WCAG 4.1.3) so screen readers announce
 * result counts when search completes.
 *
 * Broken pattern: {condition && <div role="status">} — conditionally mounts
 * the live region alongside its content; NVDA/Chrome won't announce it.
 *
 * Fixed pattern: always-present container with content that changes.
 */
import * as fs from "fs";
import * as path from "path";

const homeSrc = ["../components/SiteHeader.tsx", "../app/page.tsx", "../app/bookshelf/page.tsx"]
  .map((f) => fs.readFileSync(path.join(__dirname, f), "utf8")).join("\n");
const adminBooksSrc = fs.readFileSync(path.join(__dirname, "../app/admin/books/page.tsx"), "utf8");

// ── Home page Discover search ──────────────────────────────────────────────────

describe("Home page search live region — WCAG 4.1.3 (closes #2340)", () => {
  it("search result live region is not conditionally mounted on searching state", () => {
    // The broken pattern: {!searching && searchedQuery && !searchError && (<div role="status"...}
    expect(homeSrc).not.toMatch(
      /\{!searching\s*&&\s*searchedQuery\s*&&\s*!searchError\s*&&\s*\(/
    );
  });


});

// ── Admin books search ─────────────────────────────────────────────────────────

describe("Admin books search live region — WCAG 4.1.3 (closes #2340)", () => {
  it("search count live region is not conditionally mounted on searchQuery", () => {
    // The broken pattern: {searchQuery && (<span role="status" aria-live...}
    expect(adminBooksSrc).not.toMatch(
      /\{searchQuery\s*&&\s*\(\s*\n?\s*<span\s[^>]*role="status"/
    );
  });

  it("admin books search live region uses always-present pattern", () => {
    const idx = adminBooksSrc.indexOf('aria-label="Filter books"');
    expect(idx).toBeGreaterThan(-1);
    const section = adminBooksSrc.slice(idx, idx + 400);
    expect(section).toMatch(/aria-live="polite"/);
  });

  it("admin books search count uses ternary for empty state", () => {
    const idx = adminBooksSrc.indexOf('aria-label="Filter books"');
    const section = adminBooksSrc.slice(idx, idx + 400);
    // The content should be conditional (ternary), not the container
    expect(section).toMatch(/searchQuery\s*\?/);
  });
});
