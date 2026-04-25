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

describe("TTSControls preparing button spinner", () => {
  it("animate-spin span in preparing button has aria-hidden=true", () => {
    // The spinner alongside 'Preparing…' text is decorative
    expect(ttsControls).toMatch(
      /animate-spin[^>]*aria-hidden="true"|aria-hidden="true"[^>]*animate-spin/
    );
  });
});

describe("TTSControls loading progress bar", () => {
  it("progress bar outer container has role=progressbar", () => {
    expect(ttsControls).toMatch(/role="progressbar"/);
  });

  it("progress bar has aria-valuenow attribute", () => {
    expect(ttsControls).toMatch(/aria-valuenow/);
  });

  it("progress bar inner visual divs have aria-hidden=true", () => {
    // The filled and pulsing divs are decorative — text already says 'X of Y'
    expect(ttsControls).toMatch(/animate-pulse[^>]*aria-hidden="true"|aria-hidden="true"[^>]*animate-pulse/);
  });
});
