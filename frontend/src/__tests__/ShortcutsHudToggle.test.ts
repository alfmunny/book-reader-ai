import * as fs from "fs";
import * as path from "path";

const src = fs.readFileSync(
  path.join(__dirname, "../app/reader/[bookId]/page.tsx"),
  "utf8"
);

describe("shortcuts HUD button toggle (closes #2383)", () => {
  it("click-outside handler skips elements with data-shortcuts-trigger", () => {
    // The handler must bail out when the event target is (or is inside)
    // an element with data-shortcuts-trigger, so clicking the HUD button
    // while the panel is open actually toggles it closed instead of
    // re-opening via click event after mousedown fires setShowShortcuts(false).
    const handlerIdx = src.indexOf("setShowShortcuts(false)");
    expect(handlerIdx).toBeGreaterThan(-1);
    const block = src.slice(Math.max(0, handlerIdx - 500), handlerIdx + 100);
    expect(block).toContain("data-shortcuts-trigger");
  });

  it("header shortcuts button has data-shortcuts-trigger", () => {
    // Find the header shortcuts button (inside the hidden md:block div)
    const headerComment = src.indexOf("Keyboard shortcuts help");
    expect(headerComment).toBeGreaterThan(-1);
    const block = src.slice(headerComment, headerComment + 500);
    expect(block).toContain("data-shortcuts-trigger");
  });

  it("focus mode HUD shortcuts button has data-shortcuts-trigger", () => {
    // Find the HUD button in the focus mode pill
    const hudComment = src.indexOf("Focus Mode HUD");
    expect(hudComment).toBeGreaterThan(-1);
    const headerComment = src.indexOf("── Header ──", hudComment);
    const hudBlock = src.slice(hudComment, headerComment);
    const btnIdx = hudBlock.indexOf('aria-label="Keyboard shortcuts"');
    expect(btnIdx).toBeGreaterThan(-1);
    const window = hudBlock.slice(btnIdx, btnIdx + 600);
    expect(window).toContain("data-shortcuts-trigger");
  });
});
