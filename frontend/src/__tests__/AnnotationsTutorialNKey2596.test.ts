/**
 * Regression test for #2596:
 * The annotations tutorial must NOT say pressing N toggles the Notes sidebar
 * (N now activates sentence-selection mode, shipped in #2586).
 * The focus-mode tutorial must include N and W in its keyboard shortcuts table.
 */
import * as fs from "fs";
import * as path from "path";

const annotationsMd = fs.readFileSync(
  path.join(__dirname, "../../../docs/tutorials/annotations.md"),
  "utf8",
);

const focusModeMd = fs.readFileSync(
  path.join(__dirname, "../../../docs/tutorials/focus-mode.md"),
  "utf8",
);

describe("Annotations tutorial keyboard shortcut accuracy (closes #2596)", () => {
  it("does NOT claim N toggles the Notes sidebar", () => {
    // The old incorrect tip said: "press N in the reader to toggle the Notes sidebar"
    expect(annotationsMd).not.toMatch(/[Nn]\b.*[Nn]otes sidebar/);
    expect(annotationsMd).not.toMatch(/toggle.*[Nn]otes.*sidebar.*N\b/i);
  });

  it("mentions sentence-selection mode for the N key", () => {
    // The doc should explain N enters sentence-select mode
    expect(annotationsMd).toMatch(/[Ss]entence.{0,30}select|sentence.{0,30}mode/i);
    expect(annotationsMd).toMatch(/\bN\b/);
  });
});

describe("Focus-mode tutorial keyboard shortcuts completeness (closes #2596)", () => {
  it("includes the N key for sentence-selection mode", () => {
    expect(focusModeMd).toMatch(/\bN\b/);
    expect(focusModeMd).toMatch(/[Ss]entence/);
  });

  it("includes the W key for word mode", () => {
    expect(focusModeMd).toMatch(/\bW\b/);
    expect(focusModeMd).toMatch(/[Ww]ord/);
  });
});
