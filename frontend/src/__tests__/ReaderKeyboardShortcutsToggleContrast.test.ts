import * as fs from "fs";
import * as path from "path";

// Reader Keyboard-shortcuts toggle (off state) used text-amber-500
// (≈2.74:1 on white) for its icon — failed WCAG 1.4.11 (3:1 needed for
// non-text UI components). Closes #1656.

const src = fs.readFileSync(
  path.join(__dirname, "../app/reader/[bookId]/page.tsx"),
  "utf8",
);

describe("reader Keyboard-shortcuts toggle contrast (closes #1656)", () => {
  it("the <button> element with aria-label=\"Keyboard shortcuts\" does not use text-amber-500 anywhere in its tag", () => {
    const aria = 'aria-label="Keyboard shortcuts"';
    const ariaIdx = src.indexOf(aria);
    expect(ariaIdx).toBeGreaterThan(-1);
    // Find the opening <button before aria-label and the closing > after it,
    // capturing the entire opening tag (which contains the multiline className).
    const buttonStart = src.lastIndexOf("<button", ariaIdx);
    expect(buttonStart).toBeGreaterThan(-1);
    // The className uses a template literal with backticks, so the closing
    // > may be many lines after aria-label. Scan forward for the first
    // `>` that is *not* inside a backtick.
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
    expect(tag).toContain(aria);
    expect(tag).not.toMatch(/text-amber-500/);
  });
});
