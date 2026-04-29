// Regression: deck name input must show red border when error state is set (#2299)
import fs from "fs";
import path from "path";

const src = fs.readFileSync(
  path.join(__dirname, "../app/decks/new/page.tsx"),
  "utf8"
);

describe("decks/new — deck name input error border", () => {
  it("uses conditional border class on error", () => {
    const anchor = src.indexOf("deck-name-input");
    expect(anchor).toBeGreaterThan(-1);
    const window = src.slice(anchor, anchor + 350);
    expect(window).toContain("border-red");
  });

  it("does not use static border-amber-200 alone on name input", () => {
    const anchor = src.indexOf("deck-name-input");
    const window = src.slice(anchor, anchor + 350);
    // Must not hardcode only the amber border; must be conditional
    expect(window).not.toMatch(/className="[^"]*border border-amber-200[^"]*"/);
  });
});
