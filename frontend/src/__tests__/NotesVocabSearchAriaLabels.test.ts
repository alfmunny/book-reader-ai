import * as fs from "fs";
import * as path from "path";

const notesSrc = fs.readFileSync(
  path.join(__dirname, "../app/notes/page.tsx"),
  "utf8"
);

const vocabSrc = fs.readFileSync(
  path.join(__dirname, "../app/vocabulary/page.tsx"),
  "utf8"
);

describe("notes and vocabulary page search inputs aria-label (closes #954)", () => {
  it("notes page search input has aria-label", () => {
    const idx = notesSrc.indexOf('placeholder="Search books…"');
    expect(idx).toBeGreaterThan(-1);
    const window = notesSrc.slice(Math.max(0, idx - 300), idx + 50);
    expect(window).toContain('aria-label="Search notes by book"');
  });

  it("vocabulary page search input has aria-label", () => {
    const idx = vocabSrc.indexOf('placeholder="Search words…"');
    expect(idx).toBeGreaterThan(-1);
    const window = vocabSrc.slice(Math.max(0, idx - 300), idx + 50);
    expect(window).toContain('aria-label="Search vocabulary words"');
  });
});
