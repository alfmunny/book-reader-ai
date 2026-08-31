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
    expect(controls).toMatch(/c\.duration > 0\s*\?\s*"bg-stone-400"/);
    expect(controls).toContain('"bg-stone-200"');
  });

  it("weights segments by chunk length, on an axis that cannot rescale", () => {
    // Character counts are known when the text is split; durations are not,
    // and a duration axis lengthens with every chunk that arrives.
    expect(controls).toContain("const weights = allChunks.map((c) => Math.max(1, c.text.length));");
    expect(controls).toContain("style={{ flexGrow: weights[i], flexBasis: 0 }}");
  });

  it("keeps the bar seekable, grabbable and keyboard-reachable", () => {
    // The range is transparent so the segments show through, which left no
    // visible handle and a 6px hit area — unusable (owner, 2026-08-31).
    expect(controls).toContain('className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"');
    expect(controls).toContain('aria-label="Playback position"');
    expect(controls).toContain('<div className="relative flex-1 min-w-0 py-2">');
    // an explicit playhead, since the native thumb is invisible
    expect(controls).toContain("rounded-full bg-amber-700 ring-2 ring-white");
    expect(controls).toContain("left: `${Math.max(0, Math.min(100, headPct))}%`");
  });

  it("runs the slider on the same weighted axis the bar is drawn on", () => {
    // A time-based slider on a length-weighted bar sends the playhead
    // somewhere other than where you clicked.
    expect(controls).toContain("max={1000}");
    expect(controls).toContain("value={Math.round(Math.max(0, Math.min(100, headPct)) * 10)}");
    expect(controls).toContain("const target = (Number(e.target.value) / 1000) * totalWeight;");
    // and it converts back through the durations that exist
    expect(controls).toContain("seekTo(d > 0 ? elapsed + ((target - seen) / w) * d : elapsed);");
  });
});
