import * as fs from "fs";
import * as path from "path";

// Reader Shares toggle (off state; formerly 'Marks') used text-amber-500 +
// opacity-60 — contrast ≈1.65:1, failing WCAG 1.4.3 AA (visible text)
// and 1.4.11 (BookmarkIcon). The button is active, not disabled, so
// disabled-state relaxations don't apply. Closes #1658.

const src = fs.readFileSync(
  path.join(__dirname, "../app/reader/[bookId]/page.tsx"),
  "utf8",
);

describe("reader Shares toggle contrast (closes #1658)", () => {
  it("the <button> rendering 'Shares off' does not use text-amber-500 or opacity-60", () => {
    const marker = '"Shares off"';
    const markerIdx = src.indexOf(marker);
    expect(markerIdx).toBeGreaterThan(-1);
    // Find the enclosing <button. Walk back to the nearest <button.
    const buttonStart = src.lastIndexOf("<button", markerIdx);
    expect(buttonStart).toBeGreaterThan(-1);
    // Walk forward to the closing > of the opening tag, ignoring `>` inside
    // backtick template literals or {} expressions.
    let depth = 0;
    let inBacktick = false;
    let tagEnd = -1;
    for (let i = buttonStart; i < src.length; i++) {
      const ch = src[i];
      if (ch === "`") inBacktick = !inBacktick;
      else if (!inBacktick) {
        if (ch === "{") depth++;
        else if (ch === "}") depth--;
        else if (ch === ">" && depth === 0) { tagEnd = i; break; }
      }
    }
    expect(tagEnd).toBeGreaterThan(buttonStart);
    const tag = src.slice(buttonStart, tagEnd + 1);
    expect(tag).not.toMatch(/text-amber-500/);
    expect(tag).not.toMatch(/opacity-60/);
  });
});

describe("the toolbar toggle is named for shares, not posts (owner, 2026-08-30)", () => {
  it("reads 'Shares on' / 'Shares off' — the label track B renamed away from", () => {
    expect(src).toContain('showShares ? "Shares on" : "Shares off"');
    expect(src).not.toContain('"Posts on"');
    expect(src).not.toContain('"Posts off"');
  });
});
