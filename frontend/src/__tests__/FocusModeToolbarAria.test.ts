import * as fs from "fs";
import * as path from "path";

const src = fs.readFileSync(
  path.join(__dirname, "../app/reader/[bookId]/page.tsx"),
  "utf8"
);

describe("focus mode toolbar aria labels (closes #1293)", () => {
  it("Prev button has aria-label=Previous chapter", () => {
    expect(src).toContain('aria-label="Previous chapter"');
  });

  it("Next button has aria-label=Next chapter", () => {
    expect(src).toContain('aria-label="Next chapter"');
  });

  it("Exit focus mode button has aria-label=Exit focus mode", () => {
    expect(src).toContain('aria-label="Exit focus mode"');
  });

  it("Read paragraph button has dynamic aria-label", () => {
    expect(src).toContain('aria-label={ttsIsPlaying ? "Playing paragraph" : "Read focused paragraph"}');
  });
});
