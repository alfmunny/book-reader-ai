import fs from "fs";
import path from "path";

const readApp = (p: string) =>
  fs.readFileSync(path.resolve(__dirname, `../app/${p}`), "utf8");

const decksNew      = readApp("(shell)/decks/new/page.tsx");
const adminUploads  = readApp("(shell)/admin/uploads/page.tsx");
const adminBooks    = readApp("(shell)/admin/books/page.tsx");
const searchPage    = readApp("(shell)/search/page.tsx");

describe("Contrast wave 7 (closes #1364)", () => {
  it("decks/new label hints use text-stone-600 not text-stone-400", () => {
    expect(decksNew).not.toContain('"text-stone-400 font-normal"');
    expect(decksNew).not.toContain('"text-stone-500 font-normal"');
    expect(decksNew).toContain('"text-stone-600 font-normal"');
  });

  it("(shell)/admin/uploads date cell uses text-stone-600 not text-stone-400", () => {
    expect(adminUploads).not.toContain("text-stone-400 whitespace-nowrap");
    expect(adminUploads).not.toContain("text-stone-500 whitespace-nowrap");
    expect(adminUploads).toContain("text-stone-600 whitespace-nowrap");
  });

  it("(shell)/admin/books expand toggle uses text-stone-600 not text-stone-400 (WCAG AA)", () => {
    expect(adminBooks).not.toContain("text-stone-400 hover:text-amber-700");
    expect(adminBooks).not.toContain("text-stone-500 hover:text-amber-700");
    expect(adminBooks).toContain("text-stone-600 hover:text-amber-700");
  });

  it("(shell)/admin/books translation size label uses text-stone-600 not text-stone-400", () => {
    expect(adminBooks).not.toContain('"text-stone-400 flex-1"');
    expect(adminBooks).not.toContain('"text-stone-500 flex-1"');
    expect(adminBooks).toContain('"text-stone-600 flex-1"');
  });

  it("search page empty-state SearchIcon has aria-hidden (decorative, exempt from 1.4.11)", () => {
    expect(searchPage).toMatch(/text-stone-\d+" aria-hidden="true"/);
  });
});
