/**
 * Contrast regression for issue #1749:
 * VocabWordTooltip "Saved" state must not use text-stone-400 on bg-stone-100
 * (~2.3:1 contrast ratio, fails WCAG AA 4.5:1 for normal text).
 */
import * as fs from "fs";
import * as path from "path";

const src = fs.readFileSync(
  path.join(__dirname, "../components/VocabWordTooltip.tsx"),
  "utf8",
);

describe("VocabWordTooltip saved-state contrast (closes #1749)", () => {
  it("does not use text-stone-400 in the saved button class", () => {
    // text-stone-400 on bg-stone-100 ≈ 2.3:1 — fails WCAG AA
    expect(src).not.toMatch(/bg-stone-100[^"]*text-stone-400|text-stone-400[^"]*bg-stone-100/);
  });
});
