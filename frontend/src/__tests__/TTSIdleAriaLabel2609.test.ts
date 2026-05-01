/**
 * Regression test for #2609:
 * TTSControls idle Read button has no accessible name explaining why it's disabled.
 * Screen readers announced "Read, dimmed, button" with no context on why it cannot activate.
 *
 * Fix: the disabled idle button must carry an aria-label or title attribute so
 * assistive technologies communicate its state (WCAG 4.1.2 Name, Role, Value).
 */
import * as fs from "fs";
import * as path from "path";

const src = fs.readFileSync(
  path.join(__dirname, "../components/TTSControls.tsx"),
  "utf8",
);

describe("TTSControls idle Read button accessible name (closes #2609)", () => {
  it("disabled idle Read button has an aria-label attribute", () => {
    // Find the disabled idle fallback button block (not loading/playing/paused/error).
    // It must have both `disabled` and `aria-label` within the same button element.
    const disabledButtonMatch = src.match(
      /<button[\s\S]{0,600}?disabled[\s\S]{0,600}?aria-label="[^"]*"[\s\S]{0,300}?>[\s\S]{0,200}?Read[\s\S]{0,50}?<\/button>/,
    );
    expect(disabledButtonMatch).not.toBeNull();
  });

  it("disabled idle Read button aria-label is non-empty and descriptive", () => {
    // The label must convey why the button is inactive — not just "Read".
    // Find aria-label on a disabled button that renders "Read" text — must mention loading/unavailable.
    const match = src.match(
      /<button\s[^>]*disabled[^>]*aria-label="([^"]+)"[^>]*>[\s\S]{0,200}?Read[\s\S]{0,50}?<\/button>/,
    );
    const altMatch = src.match(
      /<button\s[^>]*aria-label="([^"]+)"[^>]*disabled[^>]*>[\s\S]{0,200}?Read[\s\S]{0,50}?<\/button>/,
    );
    const block = match || altMatch;
    expect(block).not.toBeNull();
    expect(block![1] ?? block![0]).toMatch(/loading|unavailable|preparing|no text/i);
  });
});
