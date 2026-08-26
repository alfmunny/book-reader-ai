import { readFileSync } from "fs";
import { join } from "path";

const src = readFileSync(join(__dirname, "../components/ChapterAuditPanel.tsx"), "utf8");

describe("chapter rail list semantics (WCAG 1.3.1)", () => {
  it("the rail is a list element — chapters are ordered, so <ol>", () => {
    expect(src).toMatch(/<ol[\s>]/);
  });

  it("each chapter is a list item", () => {
    expect(src).toMatch(/<li key=\{i\}>/);
  });

  it("the rail is labelled for landmark navigation", () => {
    expect(src).toMatch(/<nav aria-label="Chapters"/);
  });
});
