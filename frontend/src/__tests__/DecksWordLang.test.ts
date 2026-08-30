/**
 * Regression for #2255 — decks word list and picker must add lang attribute on
 * foreign-language vocabulary words so screen readers pronounce them correctly
 * (WCAG 3.1.2 Language of Parts, Level AA).
 */
import { readFileSync } from "fs";
import { join } from "path";

const src = readFileSync(
  join(__dirname, "../app/(shell)/decks/[deckId]/page.tsx"),
  "utf-8"
);

describe("Decks word lang attribute (closes #2255)", () => {
  it("deck word list span has lang attribute from w.language", () => {
    // The word span in the deck word list renders {w.word}
    // The first occurrence of {w.word} should be inside a span with lang
    const idx = src.indexOf('"font-serif text-ink truncate flex-1 min-w-0"');
    expect(idx).toBeGreaterThan(-1);
    const window = src.slice(idx, idx + 100);
    expect(window).toMatch(/lang=\{w\.language/);
  });

  it("vocab picker button span has lang attribute from w.language", () => {
    // The picker button also renders {w.word} in a font-serif span
    // There are two such spans; both must have lang
    const first = src.indexOf('"font-serif text-ink truncate flex-1 min-w-0"');
    const second = src.indexOf('"font-serif text-ink truncate flex-1 min-w-0"', first + 1);
    expect(second).toBeGreaterThan(-1);
    const window = src.slice(second, second + 100);
    expect(window).toMatch(/lang=\{w\.language/);
  });
});
