/**
 * Regression test for #2491:
 * When text is selected via keyboard (Shift+Arrow), the SelectionToolbar must
 * auto-focus its first button so keyboard-only users can act without Tab-hunting.
 *
 * Uses static source analysis (like ReaderPageResizeHandleFocusRing.test.ts)
 * because browser Selection APIs are not reliably simulatable in JSDOM.
 */
import { readFileSync } from "fs";
import { join } from "path";

const src = readFileSync(
  join(__dirname, "../components/SelectionToolbar.tsx"),
  "utf8",
);

describe("SelectionToolbar keyboard focus (closes #2491)", () => {
  it("tracks pointerdown to distinguish mouse vs keyboard selection", () => {
    // Must listen for pointerdown to record the time of the last pointer event
    expect(src).toMatch(/pointerdown/);
    expect(src).toMatch(/lastPointerDown|pointerDownAt|lastPointerAt/i);
  });

  it("auto-focuses first toolbar button on keyboard-driven selection", () => {
    // Must focus the first button in the toolbar when keyboard selection detected
    expect(src).toMatch(/focus\(\)/);
    // Must have the keyboard-selection heuristic (time-based: >300ms gap)
    expect(src).toMatch(/300/);
  });

  it("saves and restores previous focus when toolbar closes", () => {
    // Must save the previously focused element before moving focus
    expect(src).toMatch(/prevFocus|previousFocus|activeBefore|prevActive/i);
    // Must restore focus on close
    expect(src).toMatch(/prevFocus.*focus\(\)|focus\(\).*prevFocus/s);
  });
});
