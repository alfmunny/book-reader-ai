import * as fs from "fs";
import * as path from "path";

const src = fs.readFileSync(
  path.join(__dirname, "../app/reader/[bookId]/page.tsx"),
  "utf8"
);

describe("keyboard shortcuts accessible in focus mode (closes #2381)", () => {
  it("focus mode HUD block contains a Keyboard shortcuts toggle button", () => {
    // The HUD block: from the comment until the header comment
    const hudComment = src.indexOf("Focus Mode HUD");
    expect(hudComment).toBeGreaterThan(-1);
    const headerComment = src.indexOf("── Header ──", hudComment);
    expect(headerComment).toBeGreaterThan(-1);
    const hudBlock = src.slice(hudComment, headerComment);
    // The new shortcuts button inside the HUD pill
    const btnIdx = hudBlock.indexOf('aria-label="Keyboard shortcuts"');
    expect(btnIdx).toBeGreaterThan(-1);
  });

  it("focus mode HUD shortcuts button has focus-visible ring", () => {
    const hudComment = src.indexOf("Focus Mode HUD");
    const headerComment = src.indexOf("── Header ──", hudComment);
    const hudBlock = src.slice(hudComment, headerComment);
    // First occurrence is the button (before the fixed panel <div>)
    const btnIdx = hudBlock.indexOf('aria-label="Keyboard shortcuts"');
    expect(btnIdx).toBeGreaterThan(-1);
    const window = hudBlock.slice(btnIdx, btnIdx + 500);
    expect(window).toContain("focus-visible:ring-amber-400");
  });

  it("fixed-position shortcuts panel rendered when focusMode && showShortcuts", () => {
    const idx = src.indexOf("focusMode && showShortcuts");
    expect(idx).toBeGreaterThan(-1);
    const window = src.slice(idx, idx + 600);
    expect(window).toContain("fixed");
    expect(window).toContain("role=\"region\"");
    expect(window).toContain("Keyboard shortcuts");
  });

  it("fixed panel has id=focus-hotkeys-panel for ARIA link from HUD button", () => {
    expect(src).toContain("focus-hotkeys-panel");
  });
});
