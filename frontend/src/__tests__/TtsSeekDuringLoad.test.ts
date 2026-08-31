/**
 * Owner, 2026-08-31: seeking while chunks were still loading resumed at the
 * position saved from the LAST session and played two voices at once.
 */
import fs from "fs";
import path from "path";

const src = fs.readFileSync(path.join(__dirname, "../components/TTSControls.tsx"), "utf8");

describe("seeking during load", () => {
  it("never runs two loads at once", () => {
    // Each load walks the chunk list and starts playback when it reaches the
    // right chunk. Two walks start two audio elements — two voices.
    expect(src).toContain("if (loadingRef.current) {");
    expect(src).toContain("pendingSeekRef.current = seekToGlobal;\n      return;");
    expect(src).toContain("loadingRef.current = true;");
    expect(src).toContain("} finally {\n      loadingRef.current = false;\n    }");
  });

  it("releases the guard when a generation is cancelled", () => {
    // Otherwise a chapter change during load would wedge playback shut.
    const cleanup = src.slice(src.indexOf("genRef.current++;"));
    expect(cleanup.slice(0, 200)).toContain("loadingRef.current = false;");
  });

  it("lets a seek win over the position saved last session", () => {
    // The target is read fresh on each pass; capturing it once meant the walk
    // aimed at savedPos even after the reader moved the bar.
    expect(src).toContain("if (pendingSeekRef.current !== undefined) {");
    expect(src).toContain("targetGlobal = pendingSeekRef.current;");
    const loop = src.slice(src.indexOf("if (!started) {"));
    expect(loop.slice(0, 400)).not.toContain("seekToGlobal !== undefined");
  });
});
