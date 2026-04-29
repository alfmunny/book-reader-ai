/**
 * Regression for #2271 — sidebar annotation sentence_text must carry a lang
 * attribute for foreign-language books (WCAG 3.1.2 Language of Parts, Level AA).
 *
 * The sidebar container does NOT inherit lang={bookLanguage} from the reader
 * scroll area, so the annotation <p> tag must carry its own lang attribute.
 */
import { readFileSync } from "fs";
import { join } from "path";

const src = readFileSync(
  join(__dirname, "../app/reader/[bookId]/page.tsx"),
  "utf-8"
);

describe("Reader sidebar annotation sentence_text lang attribute (closes #2271)", () => {
  it("renderCard annotation <p> tag has lang from bookLanguage", () => {
    // renderCard is the IIFE inside the Notes tab — find the unique class string for the annotation <p>
    const anchor = src.indexOf('"text-xs italic leading-relaxed line-clamp-3 flex-1"');
    expect(anchor).toBeGreaterThan(-1);
    // lang= should appear on the same tag — check 60 chars before the className anchor
    const before = src.slice(Math.max(0, anchor - 60), anchor);
    expect(before).toMatch(/lang=\{bookLanguage/);
  });
});
