/**
 * Regression for #2245 — vocabulary word list must add lang attribute on
 * foreign-language words and context sentences so screen readers pronounce
 * them correctly (WCAG 3.1.2 Language of Parts, Level AA).
 */
import { readFileSync } from "fs";
import { join } from "path";

const src = readFileSync(
  join(__dirname, "../app/(shell)/vocabulary/page.tsx"),
  "utf-8"
);

describe("Vocabulary word list lang attribute (closes #2245)", () => {
  it("lemma button has lang attribute from group.language", () => {
    // The lemma word button should carry lang={group.language ?? undefined}
    // so screen readers use correct pronunciation rules.
    // Unique anchor: the lemma button is the one with the vocab flash handler.
    const idx = src.indexOf("setActiveWord({ word: group.lemma");
    expect(idx).toBeGreaterThan(-1);
    // Look backward 150 chars for the button opening tag
    const before = src.slice(Math.max(0, idx - 150), idx);
    expect(before).toMatch(/lang=\{group\.language/);
  });

  it("context sentence span has lang attribute from group.language", () => {
    // Each occurrence's sentence_text is rendered in the book's language;
    // it must carry a lang attribute so AT switches pronunciation. Anchor on
    // the RENDERED sentence (&ldquo;…), not the first source mention — the
    // occurrence's jump-link href also references occ.sentence_text.
    const idx = src.indexOf("&ldquo;{occ.sentence_text}");
    expect(idx).toBeGreaterThan(-1);
    const window = src.slice(Math.max(0, idx - 200), idx + 50);
    expect(window).toMatch(/lang=\{group\.language/);
  });
});
