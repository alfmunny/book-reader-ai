/**
 * Regression tests for #2193: focus-visible rings on homepage (library page) buttons.
 */
import * as fs from "fs";
import * as path from "path";

const src = fs.readFileSync(
  path.join(__dirname, "../app/page.tsx"),
  "utf8"
);

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

describe("Homepage tab bar focus rings (closes #2193)", () => {
  it("Home/Discover tab buttons have focus ring", () => {
    const idx = src.indexOf("tabpanel-${key}");
    expect(idx).toBeGreaterThan(-1);
    const window = src.slice(idx, idx + 400);
    expect(window).toContain("focus-visible:ring-amber-400");
  });

  it("Upload nav link has focus ring", () => {
    const idx = src.indexOf("href=\"/upload\"");
    expect(idx).toBeGreaterThan(-1);
    const window = src.slice(idx, idx + 300);
    expect(window).toContain("focus-visible:ring-amber-400");
  });
});

describe("Homepage discover section focus rings (closes #2193)", () => {
  it("Sign in free hero button (amber-700) has ring with amber-700 offset", () => {
    const idx = src.indexOf("Sign in free");
    expect(idx).toBeGreaterThan(-1);
    const window = src.slice(Math.max(0, idx - 300), idx + 20);
    expect(window).toContain("focus-visible:ring-amber-400");
    expect(window).toContain("ring-offset-amber-700");
  });

  it("Search button (amber-700) has ring with amber-700 offset", () => {
    // className is ~458 chars before "Searching" button label — look 500 chars back
    const idx = src.indexOf("\"Searching\"");
    expect(idx).toBeGreaterThan(-1);
    const window = src.slice(Math.max(0, idx - 500), idx + 20);
    expect(window).toContain("focus-visible:ring-amber-400");
    expect(window).toContain("ring-offset-amber-700");
  });

  it("Popular language filter buttons have focus ring", () => {
    const idx = src.indexOf("popularLang === l.code");
    expect(idx).toBeGreaterThan(-1);
    const window = src.slice(idx, idx + 300);
    expect(window).toContain("focus-visible:ring-amber-400");
  });

  it("Grid/List view toggle buttons have focus ring", () => {
    const idx = src.indexOf("aria-label=\"Grid view\"");
    expect(idx).toBeGreaterThan(-1);
    const window = src.slice(idx, idx + 300);
    expect(window).toContain("focus-visible:ring-amber-400");
  });

  it("Pagination Previous/Next buttons have focus ring", () => {
    const idx = src.indexOf("aria-label=\"Previous page of popular books\"");
    expect(idx).toBeGreaterThan(-1);
    const window = src.slice(idx, idx + 350);
    expect(window).toContain("focus-visible:ring-amber-400");
  });
});
