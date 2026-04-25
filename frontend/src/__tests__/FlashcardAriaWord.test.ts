import * as fs from "fs";
import * as path from "path";

const src = fs.readFileSync(
  path.join(__dirname, "../app/vocabulary/flashcards/page.tsx"),
  "utf8",
);

describe("flashcard card aria-label includes the word (closes #1261)", () => {
  it("aria-label for front side includes the word", () => {
    expect(src).toMatch(/aria-label=\{.*Word:.*currentCard\.word/);
  });

  it("aria-label for back side includes the word", () => {
    expect(src).toMatch(/aria-label=\{.*currentCard\.word.*definition side/i);
  });

  it("does not use the old static 'Card front — click to reveal' label", () => {
    expect(src).not.toMatch(/Card front — click to reveal/);
  });

  it("does not use the old static 'Card back — click to flip' label", () => {
    expect(src).not.toMatch(/Card back — click to flip/);
  });
});
