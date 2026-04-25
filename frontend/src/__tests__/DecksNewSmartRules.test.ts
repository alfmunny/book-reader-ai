/**
 * Static assertion: /decks/new enables Smart mode and exposes a rules
 * sub-form (language, tags_any, tags_all, saved_after, saved_before)
 * that builds rules_json on submit.
 * Closes #1197
 */
import fs from "fs";
import path from "path";

function read(rel: string): string {
  return fs.readFileSync(path.join(process.cwd(), rel), "utf8");
}

describe("Smart-rule builder on /decks/new", () => {
  const src = read("src/app/decks/new/page.tsx");

  it("smart radio is no longer disabled", () => {
    // Look for the smart radio block; it must NOT contain `disabled`
    const idx = src.indexOf('value="smart"');
    expect(idx).toBeGreaterThan(0);
    const block = src.slice(idx, idx + 400);
    expect(block).not.toMatch(/disabled\b/);
  });

  it("mode state setter is wired (allows switching modes)", () => {
    expect(src).toMatch(/setMode\s*\(/);
  });

  it("renders all five rule fields with htmlFor/id associations", () => {
    expect(src).toMatch(/htmlFor=["']deck-rule-language["']/);
    expect(src).toMatch(/id=["']deck-rule-language["']/);
    expect(src).toMatch(/htmlFor=["']deck-rule-tags-any["']/);
    expect(src).toMatch(/id=["']deck-rule-tags-any["']/);
    expect(src).toMatch(/htmlFor=["']deck-rule-tags-all["']/);
    expect(src).toMatch(/id=["']deck-rule-tags-all["']/);
    expect(src).toMatch(/htmlFor=["']deck-rule-saved-after["']/);
    expect(src).toMatch(/id=["']deck-rule-saved-after["']/);
    expect(src).toMatch(/htmlFor=["']deck-rule-saved-before["']/);
    expect(src).toMatch(/id=["']deck-rule-saved-before["']/);
  });

  it("date fields use type=date", () => {
    const afterIdx = src.indexOf('id="deck-rule-saved-after"');
    expect(afterIdx).toBeGreaterThan(0);
    const window = src.slice(Math.max(0, afterIdx - 200), afterIdx + 200);
    expect(window).toMatch(/type=["']date["']/);
  });

  it("submit builds rules_json only for smart mode", () => {
    expect(src).toMatch(/rules_json/);
    expect(src).toMatch(/mode\s*===?\s*["']smart["']/);
  });

  it("rule fields are hidden in manual mode (conditional render)", () => {
    expect(src).toMatch(/mode\s*===?\s*["']smart["']\s*&&/);
  });

  it("comma-separated tag input is split into string array", () => {
    // implementation detail tolerated: a `.split(",")` somewhere near tags
    expect(src).toMatch(/\.split\(/);
  });
});
