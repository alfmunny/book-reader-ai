/**
 * Regression test for #2573:
 * The keyboard shortcuts help button was exclusively wrapped in `hidden md:block`,
 * making it invisible on mobile. Mobile users could not discover keyboard shortcuts.
 *
 * Fix: add a keyboard shortcuts button to the mobile bottom bar, toggling a
 * panel anchored above the bar (opens upward).
 */
import * as fs from "fs";
import * as path from "path";

const src = fs.readFileSync(
  path.join(__dirname, "../app/reader/[bookId]/page.tsx"),
  "utf8",
);

// Anchor: the mobile bottom toolbar section comment is unique
const mobileToolbarIdx = src.indexOf("Mobile floating bottom toolbar");
// Anchor: the "Main bottom bar" sub-comment is inside the toolbar
const mainBarIdx = src.indexOf("Main bottom bar");

describe("Mobile keyboard shortcuts help (closes #2573)", () => {
  it("mobile floating toolbar section is present", () => {
    expect(mobileToolbarIdx).not.toBe(-1);
    expect(mainBarIdx).not.toBe(-1);
  });

  it("mobile bottom bar contains a keyboard shortcuts button", () => {
    // Slice from "Main bottom bar" until end of file — the bar content is all in there
    const barBlock = src.slice(mainBarIdx);
    expect(barBlock).toMatch(/aria-label="Keyboard shortcuts"/);
  });

  it("mobile shortcuts panel exists inside the mobile toolbar section", () => {
    const mobileBlock = src.slice(mobileToolbarIdx);
    // shortcuts-panel-mobile id, or "Keyboard Shortcuts" heading inside mobile section
    expect(mobileBlock).toMatch(/shortcuts-panel-mobile|id="shortcuts-panel-mobile"/);
  });

  it("mobile shortcuts button is inside the mobile toolbar (not just desktop nav)", () => {
    // The mobile toolbar starts at mobileToolbarIdx; find a shortcuts button after that point
    const mobileBlock = src.slice(mobileToolbarIdx);
    expect(mobileBlock).toMatch(/aria-label="Keyboard shortcuts"/);
    // Ensure the button found is NOT wrapped in hidden md:block within the mobile block
    const btnIdx = mobileBlock.indexOf('aria-label="Keyboard shortcuts"');
    const surrounding = mobileBlock.slice(Math.max(0, btnIdx - 300), btnIdx + 10);
    expect(surrounding).not.toContain("hidden md:block");
  });
});
