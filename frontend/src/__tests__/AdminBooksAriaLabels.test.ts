import * as fs from "fs";
import * as path from "path";

const src = fs.readFileSync(
  path.join(__dirname, "../app/admin/books/page.tsx"),
  "utf8"
);

describe("admin/books page form controls aria-label (closes #959)", () => {
  it("Gutenberg Book ID import input has aria-label", () => {
    const idx = src.indexOf('placeholder="Gutenberg Book ID (e.g. 2229)"');
    expect(idx).toBeGreaterThan(-1);
    const window = src.slice(Math.max(0, idx - 200), idx + 50);
    expect(window).toContain('aria-label="Gutenberg Book ID to import"');
  });

  it("translation language select has aria-label", () => {
    const idx = src.indexOf('title="Pick a language to queue for translation"');
    expect(idx).toBeGreaterThan(-1);
    // aria-label sits before a long className, look back 350 chars
    const window = src.slice(Math.max(0, idx - 350), idx + 60);
    expect(window).toContain('aria-label="Translation language"');
  });

  it("chapter move input has aria-label", () => {
    const idx = src.indexOf('placeholder="→Ch"');
    expect(idx).toBeGreaterThan(-1);
    const window = src.slice(Math.max(0, idx - 200), idx + 50);
    expect(window).toContain('aria-label="Move to chapter number"');
  });
});
