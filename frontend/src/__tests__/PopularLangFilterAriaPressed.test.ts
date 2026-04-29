import * as fs from "fs";
import * as path from "path";

const src = fs.readFileSync(
  path.join(__dirname, "../app/page.tsx"),
  "utf8"
);

describe("Popular language filter buttons aria-pressed (closes #2079)", () => {
  it("filter button has aria-pressed attribute", () => {
    expect(src).toContain("aria-pressed={popularLang === l.code}");
  });

  it("filter button container has role=group", () => {
    const idx = src.indexOf("POPULAR_LANGS.map");
    expect(idx).toBeGreaterThan(-1);
    const window = src.slice(Math.max(0, idx - 300), idx + 50);
    expect(window).toContain('role="group"');
  });

  it("filter button container has aria-label", () => {
    const idx = src.indexOf("POPULAR_LANGS.map");
    expect(idx).toBeGreaterThan(-1);
    const window = src.slice(Math.max(0, idx - 300), idx + 50);
    expect(window).toContain('aria-label="Filter by language"');
  });
});
