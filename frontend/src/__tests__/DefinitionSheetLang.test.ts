/**
 * Regression for #2261 — DefinitionSheet must add lang attribute on the word
 * span and lemma span so screen readers pronounce foreign vocabulary correctly
 * (WCAG 3.1.2 Language of Parts, Level AA).
 */
import { readFileSync } from "fs";
import { join } from "path";

const src = readFileSync(
  join(__dirname, "../app/(shell)/vocabulary/page.tsx"),
  "utf-8"
);

describe("DefinitionSheet lang attribute (closes #2261)", () => {
  it("word span has lang attribute from lang prop", () => {
    // The word is rendered in a font-serif font-bold text-xl span
    const idx = src.indexOf('"font-serif font-bold text-ink text-xl"');
    expect(idx).toBeGreaterThan(-1);
    const window = src.slice(idx, idx + 100);
    expect(window).toMatch(/lang=\{lang/);
  });

  it("lemma span has lang attribute from lang prop", () => {
    // The lemma span has aria-label containing "base form"
    const idx = src.indexOf("`base form: ${def.lemma}`");
    expect(idx).toBeGreaterThan(-1);
    const before = src.slice(Math.max(0, idx - 80), idx);
    expect(before).toMatch(/lang=\{lang/);
  });
});
