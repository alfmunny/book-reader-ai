/**
 * Regression test for #2109 — TTS tutorial must exist and cover key sections.
 */
import * as fs from "fs";
import * as path from "path";

const tutorial = fs.readFileSync(
  path.join(__dirname, "../../../docs/tutorials/tts.md"),
  "utf8",
);

const index = fs.readFileSync(
  path.join(__dirname, "../../../docs/tutorials/index.md"),
  "utf8",
);

describe("TTS tutorial (closes #2109)", () => {
  it("covers core playback controls", () => {
    expect(tutorial).toContain("Read");
    expect(tutorial).toContain("Pause");
    expect(tutorial).toContain("Space");
  });

  it("covers voice gender toggle", () => {
    expect(tutorial).toContain("Female");
    expect(tutorial).toContain("Male");
  });

  it("covers seek and speed controls", () => {
    expect(tutorial).toContain("seek");
    expect(tutorial).toContain("speed");
  });

  it("covers paragraph and sentence reading", () => {
    expect(tutorial).toContain("paragraph");
    expect(tutorial).toContain("sentence");
  });

  it("mentions position persistence", () => {
    expect(tutorial).toContain("saved automatically");
  });

  it("is linked from the tutorial index", () => {
    expect(index).toContain("tts.md");
  });
});
