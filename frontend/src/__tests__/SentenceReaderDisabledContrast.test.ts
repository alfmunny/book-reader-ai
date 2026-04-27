/**
 * Contrast regression for issue #1758:
 * SentenceReader unloaded-disabled segment must not use text-stone-400/70.
 * text-stone-400 at 70% opacity on white gives ~2.7:1 — fails WCAG AA 4.5:1.
 * The loaded-disabled state correctly uses text-stone-500 (~4.7:1); unloaded must match.
 */
import * as fs from "fs";
import * as path from "path";

const src = fs.readFileSync(
  path.join(__dirname, "../components/SentenceReader.tsx"),
  "utf8",
);

describe("SentenceReader disabled-segment contrast (closes #1758)", () => {
  it("does not use text-stone-400/70 for unloaded disabled segments", () => {
    expect(src).not.toMatch(/text-stone-400\/70/);
  });
});
