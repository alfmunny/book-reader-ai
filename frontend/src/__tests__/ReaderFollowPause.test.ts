import fs from "fs";
import path from "path";

const src = fs.readFileSync(
  path.join(__dirname, "../app/reader/[bookId]/page.tsx"),
  "utf8",
);
const icons = fs.readFileSync(path.join(__dirname, "../components/Icons.tsx"), "utf8");
const controls = fs.readFileSync(path.join(__dirname, "../components/TTSControls.tsx"), "utf8");

describe("following the line being read (owner, 2026-08-31)", () => {
  it("is on while reading and off the moment the reader turns a page", () => {
    expect(src).toContain("const [following, setFollowing] = useState(true);");
    const turn = src.slice(src.indexOf("const turnPage ="), src.indexOf("// Track scroll progress"));
    expect(turn).toContain("if (ttsIsPlayingRef.current) setFollowing(false);");
    // …without touching playback
    expect(turn).not.toMatch(/setTtsIsPlaying|pause\(\)|ttsSeekRef/);
    expect(src).toContain("if (ttsIsPlaying) setFollowing(true);");
  });

  it("only tracks the line when it is actually on screen", () => {
    expect(src).toContain("if (following && audioChapter === chapterIndex) revealElement(el);");
    // the spoken element is recorded regardless, so the toggle has a target
    expect(src).toContain("lastSpokenEl.current = el;");
  });

  it("returns to the line however far away, including another chapter", () => {
    const toggle = src.slice(src.indexOf("const toggleFollowing ="), src.indexOf("const revealSegment ="));
    expect(toggle).toContain("if (audioChapter !== chapterIndex) {");
    expect(toggle).toContain("goToChapter(audioChapter);");
    expect(toggle).toContain("revealElement(lastSpokenEl.current);");
  });

  it("leaves explicit navigation alone — only the audio follow is gated", () => {
    const seg = src.slice(src.indexOf("const revealSegment ="), src.indexOf("const chapterFraction"));
    expect(seg).not.toContain("following");
  });

  it("is a toggle beside the play control, with the state visible", () => {
    expect(controls).toContain('data-testid="follow-toggle"');
    expect(controls).toContain("aria-pressed={following}");
    expect(controls).toContain('aria-label={following ? "Following the line being read" : "Back to the line being read"}');
    // icon-only: a line with two arrows pointing at it
    expect(controls).toContain("<FollowLineIcon");
    const icon = icons.slice(icons.indexOf("export function FollowLineIcon"), icons.indexOf("export function FollowLineIcon") + 600);
    expect(icon).toContain('<line x1="4" y1="12" x2="20" y2="12"/>');
    expect((icon.match(/<polyline/g) ?? []).length).toBe(2);
  });
});

describe("reading continues across chapters (owner, 2026-08-31)", () => {
  it("gives the audio its own chapter pointer", () => {
    // TTSControls tears every chunk down when chapterIndex changes, so feeding
    // it the viewed chapter stopped playback as soon as turns crossed a
    // boundary.
    expect(src).toContain("const [audioChapter, setAudioChapter] = useState(0);");
    expect(src).toContain("chapterIndex={audioChapter}");
    expect(src).toContain('text={chapters[audioChapter]?.text ?? current?.text ?? ""}');
  });

  it("moves the audio pointer with the page only while nothing is playing", () => {
    expect(src).toContain("if (!ttsIsPlayingRef.current) setAudioChapter(chapterIndex);");
  });

  it("rolls into the next chapter when one finishes", () => {
    expect(controls).toContain("onChapterFinishedRef.current?.();");
    const handler = src.slice(src.indexOf("const handleChapterFinished ="));
    expect(handler.slice(0, 400)).toContain("setAudioChapter(next);");
    expect(handler.slice(0, 400)).toContain("if (following) goToChapter(next);");
    expect(handler.slice(0, 400)).toContain("if (next >= chapters.length) return;");
  });
});
