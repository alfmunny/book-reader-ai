import * as fs from "fs";
import * as path from "path";

const src = fs.readFileSync(
  path.join(__dirname, "../app/page.tsx"),
  "utf8"
);

describe("homepage search controls aria-label (closes #953)", () => {
  it("search input has aria-label", () => {
    const idx = src.indexOf('placeholder="Search by title or author..."');
    expect(idx).toBeGreaterThan(-1);
    // aria-label sits before a long className, so look back 350 chars
    const window = src.slice(Math.max(0, idx - 350), idx + 50);
    expect(window).toContain('aria-label="Search by title or author"');
  });

  it("language filter select has aria-label", () => {
    // Anchor on the select's onChange which is unique; aria-label precedes it
    const idx = src.indexOf('setLang(e.target.value)');
    expect(idx).toBeGreaterThan(-1);
    const window = src.slice(Math.max(0, idx - 300), idx + 10);
    expect(window).toContain('aria-label="Filter by language"');
  });
});
