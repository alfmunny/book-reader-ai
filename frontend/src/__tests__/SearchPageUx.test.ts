/**
 * Static assertions: search page parity fixes.
 * Closes #1150
 */
import fs from "fs";
import path from "path";

const page = fs.readFileSync(
  path.join(process.cwd(), "src/app/search/page.tsx"),
  "utf8",
);

describe("Search page UX parity", () => {
  it("imports ArrowLeftIcon for the back button", () => {
    expect(page).toMatch(/ArrowLeftIcon/);
  });

  it("loading state has role=status with aria-label", () => {
    expect(page).toMatch(/role="status"[^>]*aria-label="Searching"/);
  });

  it("error state has role=alert", () => {
    // The error JSX should have role="alert"
    const idx = page.indexOf("Error:");
    expect(idx).toBeGreaterThan(0);
    const block = page.slice(Math.max(0, idx - 300), idx + 100);
    expect(block).toContain('role="alert"');
  });

  it("no-results state has a Browse books CTA navigating to /", () => {
    const idx = page.indexOf("No matches for");
    expect(idx).toBeGreaterThan(0);
    const block = page.slice(idx, idx + 1000);
    expect(block).toMatch(/Browse books|Discover books/);
    expect(block).toMatch(/href="\/"|router\.push\("\/"\)|Link[^>]*href="\/"/);
  });

  it("result cards use focus-visible ring (BookCard/ContinueReading pattern)", () => {
    expect(page).toMatch(/focus-visible:-translate-y-0\.5/);
    expect(page).toMatch(/focus-visible:ring-2/);
  });
});
