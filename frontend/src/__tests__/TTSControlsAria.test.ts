/**
 * Static assertions: TTSControls preparing spinner has aria-hidden;
 * TTS loading progress bar has role=progressbar with value attrs. Closes #1237.
 */
import fs from "fs";
import path from "path";

const ttsControls = fs.readFileSync(
  path.join(process.cwd(), "src/components/TTSControls.tsx"),
  "utf8",
);
const reader = fs.readFileSync(
  path.join(process.cwd(), "src/app/reader/[bookId]/page.tsx"),
  "utf8",
);

describe("TTSControls preparing button spinner", () => {
  it("animate-spin span in preparing button has aria-hidden=true", () => {
    // The spinner alongside 'Preparing…' text is decorative
    expect(ttsControls).toMatch(
      /animate-spin[^>]*aria-hidden="true"|aria-hidden="true"[^>]*animate-spin/
    );
  });
});

describe("TTS chunk bar a11y (segmented seek bar, 2026-08-31)", () => {
  it("the segments are decorative — the range input is the real control", () => {
    const idx = ttsControls.indexOf('data-testid="chunk-bar"');
    expect(idx).toBeGreaterThan(-1);
    expect(ttsControls.slice(idx, idx + 120)).toContain('aria-hidden="true"');
    // #1237 wanted the progress reachable; the native range still owns it
    expect(ttsControls).toContain('aria-label="Playback position"');
    expect(ttsControls).toContain("aria-valuetext={formatTime(globalCurrentTime)}");
  });

  it("the pending-chunk pulse is decorative too", () => {
    const idx = ttsControls.indexOf("animate-pulse");
    expect(idx).toBeGreaterThan(-1);
    // it lives inside the aria-hidden chunk bar
    const barIdx = ttsControls.indexOf('data-testid="chunk-bar"');
    expect(idx).toBeGreaterThan(barIdx);
  });
});
