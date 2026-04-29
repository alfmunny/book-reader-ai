/**
 * Regression test for #2111 — typography tutorial must exist and cover key controls.
 */
import * as fs from "fs";
import * as path from "path";

const tutorial = fs.readFileSync(
  path.join(__dirname, "../../../docs/tutorials/typography.md"),
  "utf8",
);

const index = fs.readFileSync(
  path.join(__dirname, "../../../docs/tutorials/index.md"),
  "utf8",
);

describe("Typography panel tutorial (closes #2111)", () => {
  it("covers font size control", () => {
    expect(tutorial).toContain("Font size");
  });

  it("covers font family (serif/sans)", () => {
    expect(tutorial).toContain("Serif");
    expect(tutorial).toContain("Sans");
  });

  it("covers line spacing", () => {
    expect(tutorial).toContain("spacing");
  });

  it("covers content width", () => {
    expect(tutorial).toContain("width");
  });

  it("covers paragraph focus toggle", () => {
    expect(tutorial).toContain("Paragraph focus");
  });

  it("mentions settings persistence", () => {
    expect(tutorial).toContain("persist");
  });

  it("is linked from the tutorial index", () => {
    expect(index).toContain("typography.md");
  });
});
