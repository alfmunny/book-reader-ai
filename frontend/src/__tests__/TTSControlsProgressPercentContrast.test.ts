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
  it("no longer stacks a heading, its own bar and a preview above the controls", () => {
    expect(controls).not.toContain("Generating chunk");
    expect(controls).not.toContain("TTS audio loading progress");
    // The count and the line being generated are back by request, but as ONE
    // compact row — the height was the complaint, not the information.
    expect(controls).toContain('data-testid="tts-generating"');
    expect(controls).toContain("Generating {loadingState.index + 1}/{loadingState.total}");
    // truncated, so it cannot grow the row; the full line is in the tooltip
    expect(controls).toContain("truncate");
    expect(controls).toContain("title={loadingState.preview}");
  });

  it("keeps the count and the line being generated on one row", () => {
    expect(controls).toContain('data-testid="tts-generating"');
    expect(controls).toContain("Generating {loadingState.index + 1}/{loadingState.total}");
  });

  it("draws buffering as segments of the seek bar itself", () => {
    // A chapter-wide sliver of the 4px book bar was unreadable at any width
    // (owner, 2026-08-31); it was removed in favour of the segmented seek bar.
    expect(reader).not.toContain('data-testid="tts-buffer"');
    expect(controls).toContain('data-testid="chunk-bar"');
    // one segment per chunk, buffered solid and pending faint
    expect(controls).toContain('c.duration > 0\n                        ? "bg-stone-400"');
    expect(controls).toContain('"bg-stone-200"');
  });

  it("keeps the axis on chunk count, not on a duration that grows", () => {
    // Equal-width segments cannot rescale; a time axis lengthens with every
    // chunk that arrives and drags the fill backwards.
    expect(controls).toContain("{allChunks.map((c, i) => {");
    expect(controls).toContain("const start = allChunks.slice(0, i).reduce((sum, x) => sum + x.duration, 0);");
    expect(controls).toContain("Math.max(0, Math.min(1, (globalCurrentTime - start) / c.duration))");
  });

  it("keeps the bar seekable and keyboard-reachable", () => {
    // The native range still owns interaction; it is laid transparently over
    // the segments so there is one bar, not two.
    expect(controls).toContain('className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"');
    expect(controls).toContain('aria-label="Playback position"');
  });
});
