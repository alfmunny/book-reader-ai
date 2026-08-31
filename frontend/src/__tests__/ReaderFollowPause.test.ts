import fs from "fs";
import path from "path";

const src = fs.readFileSync(
  path.join(__dirname, "../app/reader/[bookId]/page.tsx"),
  "utf8",
);
const icons = fs.readFileSync(path.join(__dirname, "../components/Icons.tsx"), "utf8");

describe("following pauses when the reader turns away (owner, 2026-08-31)", () => {
  it("stops following on a manual turn without touching playback", () => {
    const turn = src.slice(src.indexOf("const turnPage ="), src.indexOf("// Track scroll progress"));
    expect(turn).toContain("if (ttsIsPlayingRef.current) setFollowPaused(true);");
    // nothing in the turn path may stop or seek the audio
    expect(turn).not.toMatch(/setTtsIsPlaying|pause\(\)|ttsSeekRef/);
  });

  it("keeps recording the spoken line while paused, so resume has a target", () => {
    expect(src).toContain("lastSpokenEl.current = el;");
    expect(src).toContain("if (!followPaused) revealElement(el);");
  });

  it("resumes by going back to the line and re-enabling the follow", () => {
    expect(src).toContain("const resumeFollowing = useCallback(");
    expect(src).toContain("setFollowPaused(false);\n    revealElement(lastSpokenEl.current);");
  });

  it("only pauses the audio follow — explicit navigation still reveals", () => {
    // revealSegment backs n / j / k, which are the reader asking to go
    // somewhere; those must not be gated on followPaused.
    const seg = src.slice(src.indexOf("const revealSegment ="), src.indexOf("const chapterFraction"));
    expect(seg).not.toContain("followPaused");
  });

  it("clears itself when playback stops or the chapter changes", () => {
    expect(src).toContain("if (!ttsIsPlaying) setFollowPaused(false);");
    expect(src).toContain("useEffect(() => { setFollowPaused(false); }, [chapterIndex]);");
  });

  it("offers the control beside the progress bar, only while it is needed", () => {
    expect(src).toContain("{followPaused && ttsIsPlaying && (");
    expect(src).toContain('data-testid="resume-following"');
    expect(src).toContain('aria-label="Back to the line being read"');
    // anchored to the progress bar, which had to become a positioning context
    expect(src).toContain('className="h-1 bg-amber-100/80 relative"');
    expect(icons).toContain("export function FollowLineIcon");
  });
});
