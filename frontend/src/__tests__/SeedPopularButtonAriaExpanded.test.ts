/**
 * Regression test for #2067: SeedPopularButton expand/collapse buttons
 * must have aria-expanded so screen readers know the panel state.
 */
import * as fs from "fs";
import * as path from "path";

const src = fs.readFileSync(
  path.join(__dirname, "../components/SeedPopularButton.tsx"),
  "utf8"
);

describe("SeedPopularButton expand/collapse aria-expanded (closes #2067)", () => {
  it("Show progress button has aria-expanded={false}", () => {
    expect(src).toMatch(/aria-expanded=\{false\}/);
  });

  it("Hide button has aria-expanded={true}", () => {
    expect(src).toMatch(/aria-expanded=\{true\}/);
  });

  it("expandable panel has an id for aria-controls", () => {
    expect(src).toMatch(/id="seed-progress-panel"/);
  });

  it("buttons reference the panel via aria-controls", () => {
    expect(src).toMatch(/aria-controls="seed-progress-panel"/);
  });
});
