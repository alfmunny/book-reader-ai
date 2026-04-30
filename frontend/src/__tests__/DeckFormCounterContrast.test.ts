/**
 * Regression test for #2497:
 * Character counters in the deck creation form must use text-stone-600 (not
 * text-stone-400) to meet WCAG 1.4.3 AA contrast on the parchment background.
 * text-stone-400 (#a8a29e) on parchment (#f5f0e8) ≈ 2.3:1 — fails AA.
 * text-stone-600 (#57534e) on parchment (#f5f0e8) ≈ 6.7:1 — passes AA.
 */
import * as fs from "fs";
import * as path from "path";

const src = fs.readFileSync(
  path.join(__dirname, "../app/decks/new/page.tsx"),
  "utf8",
);

function blockAfterIdAttr(id: string): string {
  // Find the <p id="<id>" ...> element (not the aria-describedby reference)
  const marker = `id="${id}"`;
  const idx = src.indexOf(marker);
  expect(idx).toBeGreaterThan(-1);
  return src.slice(idx, idx + 300);
}

describe("Deck form character counter contrast (closes #2497)", () => {
  it("name counter does not use text-stone-400 in its idle class", () => {
    const block = blockAfterIdAttr("deck-name-counter");
    expect(block).not.toMatch(/text-stone-400/);
  });

  it("description counter does not use text-stone-400 in its idle class", () => {
    const block = blockAfterIdAttr("deck-description-counter");
    expect(block).not.toMatch(/text-stone-400/);
  });

  it("name counter uses text-stone-600 for passing contrast in its idle state", () => {
    const block = blockAfterIdAttr("deck-name-counter");
    expect(block).toMatch(/text-stone-600/);
  });

  it("description counter uses text-stone-600 for passing contrast in its idle state", () => {
    const block = blockAfterIdAttr("deck-description-counter");
    expect(block).toMatch(/text-stone-600/);
  });
});
