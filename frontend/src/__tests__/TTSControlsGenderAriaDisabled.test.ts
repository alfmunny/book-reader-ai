/**
 * Regression test for #2493:
 * The TTS gender toggle button's aria-label must not say "Click to switch"
 * when the button is disabled (status === "loading") — WCAG 4.1.2.
 */
import * as fs from "fs";
import * as path from "path";

const src = fs.readFileSync(
  path.join(__dirname, "../components/TTSControls.tsx"),
  "utf8",
);

describe("TTSControls gender toggle disabled aria-label (closes #2493)", () => {
  it("aria-label line is conditional — references loading/disabled state inside the expression", () => {
    // Extract just the aria-label line for the gender toggle button.
    // The fix makes "Click to switch" conditional, so the aria-label expression
    // itself must contain a reference to "loading" or "disabled" state.
    const toggleIdx = src.indexOf("onClick={toggleGender}");
    expect(toggleIdx).toBeGreaterThan(-1);
    const toggleBlock = src.slice(toggleIdx, toggleIdx + 600);

    const ariaLabelLine = toggleBlock
      .split("\n")
      .find((line) => line.includes("aria-label="));
    expect(ariaLabelLine).toBeDefined();
    // The aria-label value must conditionally include "Click to switch"
    // based on the loading/disabled state — so "loading" must appear on the same line.
    expect(ariaLabelLine).toMatch(/loading/);
  });

  it("gender toggle button still has an aria-label that identifies the voice", () => {
    const toggleSection = src.slice(
      src.indexOf("onClick={toggleGender}"),
      src.indexOf("onClick={toggleGender}") + 600,
    );
    expect(toggleSection).toMatch(/aria-label=.*[Vv]oice/);
  });
});
