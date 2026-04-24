import * as fs from "fs";
import * as path from "path";

const notesSrc = fs.readFileSync(
  path.join(__dirname, "../app/notes/[bookId]/page.tsx"),
  "utf8"
);
const readerSrc = fs.readFileSync(
  path.join(__dirname, "../app/reader/[bookId]/page.tsx"),
  "utf8"
);

describe("notes SectionHeader toggle button aria-expanded (closes #948)", () => {
  it("SectionHeader toggle button has aria-expanded", () => {
    // Find the SectionHeader toggle button — it's the onClick={onToggle} button
    const idx = notesSrc.indexOf("onClick={onToggle}");
    expect(idx).toBeGreaterThan(-1);
    const window = notesSrc.slice(idx, idx + 300);
    expect(window).toContain("aria-expanded");
  });
});

describe("reader vocab chapter collapse toggle aria-expanded (closes #948)", () => {
  it("reader vocab chapter collapse button has aria-expanded", () => {
    // Find the vocab chapter collapse button by its unique class string
    const idx = readerSrc.indexOf("setCollapsedNoteChapters((prev)");
    expect(idx).toBeGreaterThan(-1);
    // aria-expanded should be within 200 chars before the onClick
    const window = readerSrc.slice(Math.max(0, idx - 300), idx + 50);
    expect(window).toContain("aria-expanded");
  });
});
