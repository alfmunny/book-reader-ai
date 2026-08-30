/**
 * Regression test for #2360: deck name input was missing `required` attribute —
 * screen readers could not tell users the field was mandatory before submission.
 */
import * as fs from "fs";
import * as path from "path";

const src = fs.readFileSync(
  path.join(__dirname, "../app/(shell)/decks/new/page.tsx"),
  "utf8",
);

describe("Deck name input required attribute (closes #2360)", () => {
  it("deck name input has required attribute", () => {
    const idx = src.indexOf('id="deck-name"');
    expect(idx).toBeGreaterThan(-1);
    const window = src.slice(idx, idx + 300);
    expect(window).toMatch(/\brequired\b/);
  });
});
