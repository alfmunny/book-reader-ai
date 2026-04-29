/**
 * Regression test for #2113 — flashcard page must implement 1/2/3/4 keyboard
 * shortcuts for grading after flipping the card.
 */
import * as fs from "fs";
import * as path from "path";

const src = fs.readFileSync(
  path.join(__dirname, "../app/vocabulary/flashcards/page.tsx"),
  "utf8",
);

describe("Flashcard keyboard shortcuts (closes #2113)", () => {
  it("has a global keydown listener via addEventListener", () => {
    expect(src).toContain("addEventListener");
    expect(src).toContain("keydown");
  });

  it("maps key '1' to grade 0 (Again)", () => {
    expect(src).toContain('"1": 0');
  });

  it("maps key '2' to grade 2 (Hard)", () => {
    expect(src).toContain('"2": 2');
  });

  it("maps key '3' to grade 3 (Good)", () => {
    expect(src).toContain('"3": 3');
  });

  it("maps key '4' to grade 5 (Easy)", () => {
    expect(src).toContain('"4": 5');
  });

  it("guards against typing in form controls", () => {
    expect(src).toContain("INPUT");
    expect(src).toContain("SELECT");
    expect(src).toContain("TEXTAREA");
  });

  it("shows key hint numbers on grade buttons", () => {
    expect(src).toContain("i + 1");
  });
});
