import * as fs from "fs";
import * as path from "path";

const src = fs.readFileSync(
  path.join(__dirname, "../app/decks/page.tsx"),
  "utf8"
);

describe("Decks page 'New deck' header button aria-label (closes #1023)", () => {
  it("New deck header button has aria-label attribute", () => {
    // Find the header button (not the empty-state button)
    const idx = src.indexOf('data-testid="decks-new-btn"');
    expect(idx).toBeGreaterThan(-1);
    const window = src.slice(Math.max(0, idx - 200), idx + 200);
    expect(window).toContain("aria-label");
  });

  it("New deck header button aria-label is 'New deck'", () => {
    const idx = src.indexOf('data-testid="decks-new-btn"');
    expect(idx).toBeGreaterThan(-1);
    const window = src.slice(Math.max(0, idx - 200), idx + 200);
    expect(window).toMatch(/aria-label=["']New deck["']/);
  });
});
