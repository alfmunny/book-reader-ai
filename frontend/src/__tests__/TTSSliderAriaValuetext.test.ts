/**
 * Regression test for issue #2400: TTS sliders missing aria-valuetext.
 * Screen readers announced raw floats ("152.3") instead of formatted values
 * ("2:32" for position, "1.0×" for speed). WCAG 4.1.2 — Name, Role, Value.
 */
import fs from "fs";
import path from "path";

const src = fs.readFileSync(
  path.join(process.cwd(), "src/components/TTSControls.tsx"),
  "utf8",
);

describe("TTSControls sliders — aria-valuetext (issue #2400)", () => {
  it("playback position slider has aria-valuetext with formatted time", () => {
    const posSlider = src.indexOf('aria-label="Playback position"');
    expect(posSlider).toBeGreaterThan(0);
    // Grab the surrounding input block (up to 300 chars back to include the whole tag)
    const block = src.slice(Math.max(0, posSlider - 300), posSlider + 300);
    expect(block).toMatch(/aria-valuetext/);
    // Should reference formatTime, not a raw number
    expect(block).toMatch(/formatTime/);
  });

  it("speed slider has aria-label", () => {
    // The speed slider is at the second type="range"; confirm it has an aria-label
    const first = src.indexOf('type="range"');
    const second = src.indexOf('type="range"', first + 1);
    expect(second).toBeGreaterThan(first);
    const block = src.slice(second, second + 400);
    expect(block).toMatch(/aria-label/);
  });

  it("speed slider has aria-valuetext with × suffix", () => {
    const first = src.indexOf('type="range"');
    const second = src.indexOf('type="range"', first + 1);
    const block = src.slice(second, second + 400);
    expect(block).toMatch(/aria-valuetext/);
    // Should reference rate and the × symbol
    expect(block).toMatch(/×/);
  });
});
