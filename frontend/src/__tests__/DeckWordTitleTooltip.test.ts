import fs from "fs";
import path from "path";

const src = fs.readFileSync(
  path.join(__dirname, "../app/(shell)/decks/[deckId]/page.tsx"),
  "utf8"
);

describe("Deck word-list title tooltips for truncated vocabulary words", () => {
  it("member word list span has title attribute near truncate class", () => {
    // Find the member words list span — it uses truncate and shows w.word
    const idx = src.indexOf("memberWords.map");
    expect(idx).toBeGreaterThan(-1);
    const window = src.slice(idx, idx + 400);
    expect(window).toContain('title={w.word}');
  });

  it("add-word picker button has title attribute", () => {
    const idx = src.indexOf('aria-label={`Add ${w.word} to deck`}');
    expect(idx).toBeGreaterThan(-1);
    const window = src.slice(idx, idx + 300);
    expect(window).toContain('title={w.word}');
  });
});
