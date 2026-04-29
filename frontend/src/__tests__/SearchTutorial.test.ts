/**
 * Regression test for #2119 — Search tutorial must exist and cover key sections.
 */
import * as fs from "fs";
import * as path from "path";

const tutorial = fs.readFileSync(
  path.join(__dirname, "../../../docs/tutorials/search.md"),
  "utf8",
);

const index = fs.readFileSync(
  path.join(__dirname, "../../../docs/tutorials/index.md"),
  "utf8",
);

describe("Search tutorial (closes #2119)", () => {
  it("explains how to access search", () => {
    expect(tutorial).toMatch(/search bar|search icon/i);
  });

  it("covers annotations search", () => {
    expect(tutorial).toContain("Annotations");
  });

  it("covers vocabulary search", () => {
    expect(tutorial).toContain("Vocabulary");
  });

  it("covers chapter content search", () => {
    expect(tutorial).toContain("Chapters");
  });

  it("explains how to navigate to a result", () => {
    expect(tutorial).toMatch(/click|tap/i);
  });

  it("covers the no-results state", () => {
    expect(tutorial).toMatch(/no.{0,10}result|no.{0,10}match/i);
  });

  it("documents the / keyboard shortcut", () => {
    expect(tutorial).toMatch(/keyboard shortcut|press.*\//i);
  });

  it("is linked from the tutorial index", () => {
    expect(index).toContain("search.md");
  });
});
