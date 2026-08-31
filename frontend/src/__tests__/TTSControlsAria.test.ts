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

describe("TTS loading progress a11y (moved into the reading bar 2026-08-31)", () => {
  it("lives inside a container that is already a labelled progressbar", () => {
    const idx = reader.indexOf('data-testid="tts-buffer"');
    expect(idx).toBeGreaterThan(-1);
    const enclosing = reader.slice(Math.max(0, idx - 1200), idx);
    expect(enclosing).toMatch(/role="progressbar"/);
    expect(enclosing).toMatch(/aria-valuenow/);
  });

  it("the buffering fill is decorative and the state is announced instead", () => {
    const idx = reader.indexOf('data-testid="tts-buffer"');
    const block = reader.slice(idx, idx + 600);
    expect(block).toMatch(/animate-pulse[\s\S]*aria-hidden="true"/);
    // #1237 required the numbers to be readable; they are now announced.
    expect(block).toContain('role="status"');
    expect(block).toContain("Generating audio, chunk");
  });
});
