import * as fs from "fs";
import * as path from "path";

const src = fs.readFileSync(
  path.join(__dirname, "../components/SelectionToolbar.tsx"),
  "utf8"
);

describe("SelectionToolbar aria-labels (closes #823)", () => {
  it("Read button has aria-label", () => {
    expect(src).toContain('aria-label="Read aloud"');
  });

  it("Highlight button has aria-label", () => {
    expect(src).toContain('aria-label="Highlight"');
  });

  it("Note button has aria-label", () => {
    expect(src).toContain('aria-label="Add note"');
  });

  it("Chat button has aria-label", () => {
    expect(src).toContain('aria-label="Ask AI"');
  });

  it("Word/Vocab button has aria-label", () => {
    expect(src).toContain('aria-label="Look up word"');
  });

  it("SpeakerIcon is aria-hidden", () => {
    const speakerIdx = src.indexOf('<SpeakerIcon');
    expect(speakerIdx).toBeGreaterThan(-1);
    const window = src.slice(speakerIdx, speakerIdx + 80);
    expect(window).toContain('aria-hidden="true"');
  });
});
