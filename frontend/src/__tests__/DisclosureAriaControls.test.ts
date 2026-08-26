import * as fs from "fs";
import * as path from "path";

const homeSrc = fs.readFileSync(
  path.join(__dirname, "../app/bookshelf/page.tsx"),
  "utf8"
);

const readerSrc = fs.readFileSync(
  path.join(__dirname, "../app/reader/[bookId]/page.tsx"),
  "utf8"
);

describe("Disclosure button aria-controls (closes #2081)", () => {
  describe("Home page stats toggle", () => {
    it('stats toggle button has aria-controls="stats-activity-panel"', () => {
      expect(homeSrc).toContain('aria-controls="stats-activity-panel"');
    });

    it('stats panel has id="stats-activity-panel"', () => {
      expect(homeSrc).toContain('id="stats-activity-panel"');
    });

    it("aria-controls and id appear near aria-expanded statsExpanded usage", () => {
      const idx = homeSrc.indexOf('aria-expanded={statsExpanded}');
      expect(idx).toBeGreaterThan(-1);
      const window = homeSrc.slice(idx, idx + 4000);
      expect(window).toContain('aria-controls="stats-activity-panel"');
      expect(window).toContain('id="stats-activity-panel"');
    });
  });

  describe("Reader page shortcuts toggle", () => {
    it('shortcuts toggle button has aria-controls="shortcuts-panel"', () => {
      expect(readerSrc).toContain('aria-controls="shortcuts-panel"');
    });

    it('shortcuts panel has id="shortcuts-panel"', () => {
      expect(readerSrc).toContain('id="shortcuts-panel"');
    });
  });
});
