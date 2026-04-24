import * as fs from "fs";
import * as path from "path";

const src = fs.readFileSync(
  path.join(__dirname, "../app/reader/[bookId]/page.tsx"),
  "utf8"
);

describe("Reader header buttons aria-label (closes #1015)", () => {
  it("Library back button has aria-label", () => {
    // Find the back-to-library button
    const idx = src.indexOf('router.push("/")');
    expect(idx).toBeGreaterThan(-1);
    const window = src.slice(Math.max(0, idx - 200), idx + 50);
    expect(window).toContain("aria-label");
  });

  it("Library back button aria-label references Library", () => {
    const idx = src.indexOf('router.push("/")');
    expect(idx).toBeGreaterThan(-1);
    const window = src.slice(Math.max(0, idx - 200), idx + 50);
    expect(window).toMatch(/aria-label=.*[Ll]ibrary/);
  });

  it("Typography header button has aria-label", () => {
    // Find the Typography panel toggle button (title="Typography settings")
    const idx = src.indexOf('title="Typography settings"');
    expect(idx).toBeGreaterThan(-1);
    const window = src.slice(Math.max(0, idx - 50), idx + 100);
    expect(window).toContain("aria-label");
  });

  it("Focus mode toggle button has aria-label", () => {
    // Find the focus mode button (title="Focus mode (F)")
    const idx = src.indexOf('title="Focus mode (F)"');
    expect(idx).toBeGreaterThan(-1);
    const window = src.slice(Math.max(0, idx - 50), idx + 100);
    expect(window).toContain("aria-label");
  });

  it("Profile avatar button has aria-label", () => {
    // Find the profile button (router.push("/profile") in header)
    const idx = src.indexOf('router.push("/profile")');
    expect(idx).toBeGreaterThan(-1);
    const window = src.slice(Math.max(0, idx - 50), idx + 200);
    expect(window).toContain("aria-label");
  });
});
