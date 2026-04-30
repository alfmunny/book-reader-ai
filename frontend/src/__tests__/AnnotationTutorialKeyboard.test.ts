/**
 * Regression test for #2499:
 * The annotations tutorial must document the text-selection and keyboard flow
 * added in PR #2492 (Shift+Arrow to select, toolbar auto-focus, Escape to dismiss).
 */
import * as fs from "fs";
import * as path from "path";

const src = fs.readFileSync(
  path.join(__dirname, "../../../docs/tutorials/annotations.md"),
  "utf8",
);

describe("Annotations tutorial covers text-selection and keyboard flow (closes #2499)", () => {
  it("mentions Shift+Arrow keyboard selection", () => {
    expect(src).toMatch(/Shift\+Arrow|Shift \+ Arrow/i);
  });

  it("mentions Escape to dismiss the toolbar", () => {
    expect(src).toMatch(/Escape/);
  });

  it("mentions the text selection / phrase selection workflow", () => {
    expect(src).toMatch(/select.*phrase|phrase.*select|partial text selection|Select a phrase/i);
  });

  it("still covers the sentence-click workflow", () => {
    expect(src).toMatch(/click any sentence/i);
  });
});
