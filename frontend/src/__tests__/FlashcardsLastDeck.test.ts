/**
 * Static assertion: /vocabulary/flashcards persists the selected deck id
 * via localStorage("flashcards.lastDeckId") wrapped in try/catch.
 * Closes #1199
 */
import fs from "fs";
import path from "path";

function read(rel: string): string {
  return fs.readFileSync(path.join(process.cwd(), rel), "utf8");
}

describe("Flashcards lastDeckId persistence", () => {
  const src = read("src/app/vocabulary/flashcards/page.tsx");

  it("reads lastDeckId from localStorage on mount", () => {
    expect(src).toMatch(/localStorage\.getItem\(\s*["']flashcards\.lastDeckId["']/);
  });

  it("writes lastDeckId to localStorage on change", () => {
    expect(src).toMatch(/localStorage\.setItem\(\s*["']flashcards\.lastDeckId["']/);
  });

  it("removes the key when 'All decks' is selected (no deck id)", () => {
    expect(src).toMatch(/localStorage\.removeItem\(\s*["']flashcards\.lastDeckId["']/);
  });

  it("wraps storage access in try/catch (SSR + private-mode safety)", () => {
    // At least one try block in proximity to a localStorage call
    const idx = src.indexOf("localStorage");
    expect(idx).toBeGreaterThan(0);
    const window = src.slice(Math.max(0, idx - 200), idx + 400);
    expect(window).toMatch(/try\s*\{/);
    expect(window).toMatch(/catch\s*[\(\{]/);
  });

  it("only restores the saved id if it matches one of the user's decks", () => {
    // Confidence that the restore path checks against the loaded decks list
    expect(src).toMatch(/decks\.(some|find)\b/);
  });
});
