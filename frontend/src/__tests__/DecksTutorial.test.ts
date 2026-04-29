/**
 * Regression test for #2117 — Decks tutorial must exist and cover key sections.
 */
import * as fs from "fs";
import * as path from "path";

const tutorial = fs.readFileSync(
  path.join(__dirname, "../../../docs/tutorials/decks.md"),
  "utf8",
);

const index = fs.readFileSync(
  path.join(__dirname, "../../../docs/tutorials/index.md"),
  "utf8",
);

describe("Decks tutorial (closes #2117)", () => {
  it("explains how to create a deck", () => {
    expect(tutorial).toContain("New deck");
  });

  it("covers manual deck mode", () => {
    expect(tutorial).toContain("Manual");
  });

  it("covers smart deck mode with rules", () => {
    expect(tutorial).toContain("Smart");
    expect(tutorial).toContain("rule");
  });

  it("explains filtering flashcards by deck", () => {
    expect(tutorial).toContain("Deck:");
  });

  it("explains how to add words to a deck", () => {
    expect(tutorial).toContain("Add word");
  });

  it("is linked from the tutorial index", () => {
    expect(index).toContain("decks.md");
  });
});
