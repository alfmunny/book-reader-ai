/**
 * Regression test for #1907: TTSControls "Preparing…" (cancel) button must have
 * aria-label so screen readers announce the cancellation action, not just "Preparing…".
 * Decorative icons in TTS buttons should be aria-hidden to avoid noise.
 */
import * as fs from "fs";
import * as path from "path";

const src = fs.readFileSync(
  path.join(__dirname, "../components/TTSControls.tsx"),
  "utf8",
);

describe("TTSControls button accessibility (closes #1907)", () => {
  it("loading/cancel button has aria-label describing cancellation", () => {
    expect(src).toMatch(/aria-label="Cancel audio loading"/);
  });

  it("CloseIcon inside loading button is aria-hidden", () => {
    expect(src).toMatch(/<CloseIcon[^>]*aria-hidden="true"/);
  });

  it("PauseIcon inside Pause button is aria-hidden", () => {
    expect(src).toMatch(/<PauseIcon[^>]*aria-hidden="true"/);
  });

  it("PlayIcon inside Read button is aria-hidden", () => {
    expect(src).toMatch(/<PlayIcon[^>]*aria-hidden="true"/);
  });

  it("RetryIcon inside Retry button is aria-hidden", () => {
    expect(src).toMatch(/<RetryIcon[^>]*aria-hidden="true"/);
  });
});
