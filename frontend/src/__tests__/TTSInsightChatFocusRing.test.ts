import fs from "fs";
import path from "path";

const tts = fs.readFileSync(
  path.resolve(__dirname, "../components/TTSControls.tsx"),
  "utf8",
);
const chat = fs.readFileSync(
  path.resolve(__dirname, "../components/InsightChat.tsx"),
  "utf8",
);

describe("TTSControls button focus rings (closes #2180)", () => {
  it("Cancel loading button has focus ring", () => {
    // Skip function definition; find the onClick usage
    const defIdx = tts.indexOf("cancelLoad");
    const idx = tts.indexOf("cancelLoad", defIdx + 1);
    expect(idx).toBeGreaterThan(-1);
    const window = tts.slice(idx, idx + 350);
    expect(window).toContain("focus-visible:ring-amber-400");
  });

  it("Pause button (playing state) has focus ring", () => {
    // data-tts-play first occurrence is the pause button
    const idx = tts.indexOf("data-tts-play");
    expect(idx).toBeGreaterThan(-1);
    const window = tts.slice(idx, idx + 300);
    expect(window).toContain("focus-visible:ring-amber-400");
  });

  it("Read/Resume button (paused state, amber-700 bg) has focus ring with offset", () => {
    const first = tts.indexOf("data-tts-play");
    const idx = tts.indexOf("data-tts-play", first + 1);
    expect(idx).toBeGreaterThan(-1);
    const window = tts.slice(idx, idx + 400);
    expect(window).toContain("focus-visible:ring-amber-400");
    expect(window).toContain("ring-offset-amber-700");
  });

  it("Error retry button has red focus ring", () => {
    const idx = tts.indexOf('status === "error"');
    expect(idx).toBeGreaterThan(-1);
    const window = tts.slice(idx, idx + 500);
    expect(window).toContain("focus-visible:ring-red-400");
  });

  it("Gender toggle button has focus ring", () => {
    // Skip function definition; find the onClick usage
    const defIdx = tts.indexOf("toggleGender");
    const idx = tts.indexOf("toggleGender", defIdx + 1);
    expect(idx).toBeGreaterThan(-1);
    const window = tts.slice(idx, idx + 500);
    expect(window).toContain("focus-visible:ring-amber-400");
  });
});

describe("InsightChat button focus rings (closes #2180)", () => {
  it("Font size toggle button has focus ring", () => {
    // Look forward from the onClick body (chatFontSize toggle logic)
    const idx = chat.indexOf('chatFontSize === "xs" ? "sm" : "xs"');
    expect(idx).toBeGreaterThan(-1);
    const window = chat.slice(idx, idx + 600);
    expect(window).toContain("focus-visible:ring-amber-400");
  });

  it("Refresh insight button has focus ring", () => {
    // aria-label="Append a fresh insight" comes before className — need extra window
    const idx = chat.indexOf('"Append a fresh insight"');
    expect(idx).toBeGreaterThan(-1);
    const window = chat.slice(idx, idx + 450);
    expect(window).toContain("focus-visible:ring-amber-400");
  });

  it("Load earlier messages button has focus ring", () => {
    // Skip function definition; find onClick usage
    const defIdx = chat.indexOf("loadEarlier");
    const idx = chat.indexOf("loadEarlier", defIdx + 1);
    expect(idx).toBeGreaterThan(-1);
    const window = chat.slice(idx, idx + 400);
    expect(window).toContain("focus-visible:ring-amber-400");
  });

  it("Send message button has focus ring", () => {
    // className comes before aria-label="Send message" — look back
    const idx = chat.indexOf('aria-label="Send message"');
    expect(idx).toBeGreaterThan(-1);
    const window = chat.slice(Math.max(0, idx - 350), idx + 20);
    expect(window).toContain("focus-visible:ring-amber-400");
  });

  it("Toggle context button has focus ring", () => {
    // className comes before aria-label="Toggle context" — look back
    const idx = chat.indexOf('"Toggle context"');
    expect(idx).toBeGreaterThan(-1);
    const window = chat.slice(Math.max(0, idx - 300), idx + 20);
    expect(window).toContain("focus-visible:ring-amber-400");
  });

  it("Remove context button has focus ring", () => {
    // onClick={onRemove} comes before className — look forward
    const idx = chat.indexOf("onClick={onRemove}");
    expect(idx).toBeGreaterThan(-1);
    const window = chat.slice(idx, idx + 300);
    expect(window).toContain("focus-visible:ring-amber-400");
  });
});
