/**
 * Regression test: profile page radio groups missing accessible group label (closes #2385).
 *
 * The TTS gender and translation-provider radio groups had no programmatic association
 * between their visual heading label and the radio group container. Fix adds
 * role="radiogroup" + aria-labelledby on each container, satisfying WCAG 1.3.1.
 */
import * as fs from "fs";
import * as path from "path";

const src = fs.readFileSync(
  path.join(__dirname, "../app/profile/page.tsx"),
  "utf8"
);

describe("Profile page radio group accessibility (closes #2385)", () => {
  it("TTS gender container has role=radiogroup", () => {
    const idx = src.indexOf("tts-gender-label");
    expect(idx).toBeGreaterThan(-1);
    const block = src.slice(Math.max(0, idx - 200), idx + 100);
    expect(block).toContain('role="radiogroup"');
  });

  it("TTS gender heading has id=tts-gender-label", () => {
    expect(src).toContain('id="tts-gender-label"');
  });

  it("TTS gender container has aria-labelledby=tts-gender-label", () => {
    expect(src).toContain('aria-labelledby="tts-gender-label"');
  });

  it("Translation provider container has role=radiogroup", () => {
    const idx = src.indexOf("translation-provider-label");
    expect(idx).toBeGreaterThan(-1);
    const block = src.slice(Math.max(0, idx - 200), idx + 100);
    expect(block).toContain('role="radiogroup"');
  });

  it("Translation provider heading has id=translation-provider-label", () => {
    expect(src).toContain('id="translation-provider-label"');
  });

  it("Translation provider container has aria-labelledby=translation-provider-label", () => {
    expect(src).toContain('aria-labelledby="translation-provider-label"');
  });
});
