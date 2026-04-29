/**
 * Static-analysis tests for WCAG 3.1.2 lang attribute on flashcard
 * "How well did you remember {word}" feedback span (issue #2289).
 */
import * as fs from "fs";
import * as path from "path";

const SRC = path.resolve(
  __dirname,
  "../app/vocabulary/flashcards/page.tsx"
);

describe("Flashcard WCAG 3.1.2 lang on feedback word span", () => {
  let src: string;

  beforeAll(() => {
    src = fs.readFileSync(SRC, "utf8");
  });

  it("feedback question exists in source", () => {
    expect(src).toContain("How well did you remember");
  });

  it("word span in feedback question carries lang attribute", () => {
    const anchor = src.indexOf("How well did you remember");
    expect(anchor).toBeGreaterThan(-1);
    const block = src.slice(anchor, anchor + 150);
    expect(block).toMatch(/lang=\{currentCard\.language/);
  });
});
