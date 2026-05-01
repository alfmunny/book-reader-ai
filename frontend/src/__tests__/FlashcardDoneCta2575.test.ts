/**
 * Regression test for #2575:
 * Flashcard done state must include a secondary CTA linking to /decks
 * so users can immediately navigate to another deck without backtracking.
 */
import * as fs from "fs";
import * as path from "path";

const src = fs.readFileSync(
  path.join(__dirname, "../app/vocabulary/flashcards/page.tsx"),
  "utf8",
);

describe("Flashcard done state secondary CTA (closes #2575)", () => {
  it("done state contains a link to /decks", () => {
    const doneIdx = src.indexOf("All done for today");
    expect(doneIdx).not.toBe(-1);
    const doneBlock = src.slice(doneIdx, doneIdx + 600);
    expect(doneBlock).toContain("/decks");
  });

  it("done state /decks link is an anchor or Link element", () => {
    const doneIdx = src.indexOf("All done for today");
    expect(doneIdx).not.toBe(-1);
    const doneBlock = src.slice(doneIdx, doneIdx + 600);
    // Either href="/decks" or href={`/decks`}
    expect(doneBlock).toMatch(/href=["'`]\/decks["'`]/);
  });

  it("done state still retains Back to Vocabulary link", () => {
    const doneIdx = src.indexOf("All done for today");
    expect(doneIdx).not.toBe(-1);
    const doneBlock = src.slice(doneIdx, doneIdx + 1000);
    expect(doneBlock).toContain("/vocabulary");
  });
});
