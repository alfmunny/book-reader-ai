import * as fs from "fs";
import * as path from "path";

// #1653: the chunk-progress percentage label used text-amber-600 at text-xs on
// white (≈3.62:1) and failed WCAG 1.4.3 AA. That whole block — heading, bar and
// preview line — was removed on 2026-08-31; chunk progress is now drawn as
// buffering inside the reading progress bar. This test keeps the contrast
// requirement attached to wherever the progress actually lives.

const controls = fs.readFileSync(
  path.join(__dirname, "../components/TTSControls.tsx"),
  "utf8",
);
const reader = fs.readFileSync(
  path.join(__dirname, "../app/reader/[bookId]/page.tsx"),
  "utf8",
);

describe("TTS chunk progress (closes #1653, relocated 2026-08-31)", () => {
  it("no longer stacks a heading, bar and preview above the controls", () => {
    expect(controls).not.toContain("Generating chunk");
    expect(controls).not.toContain("TTS audio loading progress");
    // The preview line went with it — TTSLoadingPreviewTitle.test.ts guarded a
    // tooltip on that element and was removed with it (2026-08-31).
    expect(controls).not.toContain("loadingState.preview}…");
  });

  it("reports progress upward instead of rendering it", () => {
    expect(controls).toContain("onLoadingStateChange");
    expect(controls).toContain("useEffect(() => { onLoadingStateRef.current?.(loadingState); }, [loadingState]);");
  });

  it("draws it as buffering in the reading bar, with no low-contrast label", () => {
    expect(reader).toContain('data-testid="tts-buffer"');
    // The percentage text that failed contrast is gone entirely; the state is
    // announced to screen readers instead of printed in amber-600.
    expect(reader).toContain("Generating audio, chunk {ttsLoading.index + 1} of {ttsLoading.total}");
    const idx = reader.indexOf('data-testid="tts-buffer"');
    expect(reader.slice(idx - 200, idx + 400)).not.toMatch(/text-amber-600/);
  });

  it("measures buffering in chunks and draws it in the audio chapter's slice", () => {
    // Chunk counts are known up front; total duration is not, and grows with
    // every chunk that loads — a time-based bar would rescale and jump.
    expect(reader).toContain("(ttsLoading.index + 1) / ttsLoading.total / chapters.length");
    expect(reader).toContain("left: `${(audioChapter / chapters.length) * 100}%`");
  });
});
