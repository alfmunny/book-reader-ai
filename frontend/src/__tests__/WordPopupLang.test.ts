/**
 * Regression for #2257 — word popup components (VocabWordTooltip and
 * WordActionDrawer) must add lang attribute on the displayed word so screen
 * readers pronounce foreign-language vocabulary correctly
 * (WCAG 3.1.2 Language of Parts, Level AA).
 */
import { readFileSync } from "fs";
import { join } from "path";

const tooltip = readFileSync(
  join(__dirname, "../components/VocabWordTooltip.tsx"),
  "utf-8"
);

const drawer = readFileSync(
  join(__dirname, "../components/WordActionDrawer.tsx"),
  "utf-8"
);

describe("Word popup components lang attribute (closes #2257)", () => {
  it("VocabWordTooltip word span has lang attribute from lang prop", () => {
    // The word span has id="vocab-tooltip-title"; use id= prefix to skip aria-labelledby
    const idx = tooltip.indexOf('id="vocab-tooltip-title"');
    expect(idx).toBeGreaterThan(-1);
    const window = tooltip.slice(idx, idx + 120);
    expect(window).toMatch(/lang=\{lang/);
  });

  it("WordActionDrawer word span has lang attribute from language prop", () => {
    // The word is rendered in font-serif font-bold text-xl span
    const idx = drawer.indexOf('"font-serif font-bold text-ink text-xl"');
    expect(idx).toBeGreaterThan(-1);
    const window = drawer.slice(idx, idx + 80);
    expect(window).toMatch(/lang=\{language/);
  });
});
