/**
 * Regression tests for #2557:
 * Vocabulary word button had no visual affordance on touch devices —
 * `text-ink` (dark ink) with only `hover:text-amber-700` means touch users
 * see static text with no indication the word is tappable.
 * Fix: use `text-amber-700` as the base color so the word looks like a link
 * on all devices.
 */
import * as fs from "fs";
import * as path from "path";

const src = fs.readFileSync(
  path.join(__dirname, "../app/(shell)/vocabulary/page.tsx"),
  "utf8",
);

describe("Vocabulary word button has visual affordance on touch (closes #2557)", () => {
  it("lemma button has text-amber-700 base color (not text-ink)", () => {
    // Find the lemma button's className. It should start with text-amber-700
    // so it's visible as interactive on touch devices without hover.
    // The button has lang={group.language} and sets activeWord onClick.
    const lemmaButtonIdx = src.indexOf("onClick={() => setActiveWord");
    expect(lemmaButtonIdx).not.toBe(-1);
    // className comes after onClick in source — look 400 chars after
    const context = src.slice(lemmaButtonIdx, lemmaButtonIdx + 400);
    expect(context).toContain("text-amber-700");
    expect(context).not.toMatch(/\btext-ink\b[^"]*hover:text-amber-700/);
  });

  it("lemma button does not rely solely on hover for color change", () => {
    // The pattern `text-ink ... hover:text-amber-700` (non-interactive base)
    // should not exist on the word button in the vocabulary card.
    const badPattern = /font-serif font-semibold text-ink[^"]*hover:text-amber-700/;
    expect(src).not.toMatch(badPattern);
  });
});
