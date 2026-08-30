/**
 * Regression for #1854 — AddWordPicker dialog must not be wrapped in
 * aria-hidden="true"; doing so hides the dialog from all screen readers
 * (WCAG 4.1.2).
 */
import { readFileSync } from "fs";
import { join } from "path";

const src = readFileSync(
  join(__dirname, "../app/(shell)/decks/[deckId]/page.tsx"),
  "utf-8"
);

describe("AddWordPicker dialog accessibility (closes #1854)", () => {
  it("dialog is not wrapped inside an aria-hidden element", () => {
    // Find the dialog element
    const dialogIdx = src.indexOf('role="dialog"');
    expect(dialogIdx).toBeGreaterThan(-1);

    // Look at the surrounding 500 chars before the dialog for aria-hidden="true"
    const beforeDialog = src.slice(Math.max(0, dialogIdx - 500), dialogIdx);

    // The last opening of a container div before the dialog must not be aria-hidden
    // Find the last aria-hidden="true" occurrence before the dialog
    const lastAriaHiddenIdx = beforeDialog.lastIndexOf('aria-hidden="true"');

    if (lastAriaHiddenIdx === -1) {
      // No aria-hidden before the dialog — pass
      return;
    }

    // There must be a closing </div> between the aria-hidden and the dialog
    // meaning the aria-hidden element is NOT an ancestor of the dialog
    const textBetween = beforeDialog.slice(lastAriaHiddenIdx);
    // If the last unclosed div before the dialog has aria-hidden, it wraps the dialog
    // Check that the backdrop div's aria-hidden="true" is not present on the parent container
    expect(textBetween).not.toMatch(/aria-hidden="true"[^>]*>\s*$/);
  });

  it("backdrop overlay div does not have aria-hidden attribute", () => {
    // The fixed overlay that holds the dialog should not have aria-hidden="true"
    // Pattern: fixed inset-0 wrapper with aria-hidden
    expect(src).not.toMatch(/fixed inset-0[^>]*aria-hidden="true"/);
    expect(src).not.toMatch(/aria-hidden="true"[^>]*fixed inset-0/);
  });

  it("dialog has role=dialog and aria-modal=true", () => {
    expect(src).toContain('role="dialog"');
    expect(src).toContain('aria-modal="true"');
    expect(src).toContain('aria-labelledby="add-word-picker-title"');
  });
});
