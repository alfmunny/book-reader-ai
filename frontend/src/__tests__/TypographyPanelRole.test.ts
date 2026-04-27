/**
 * Regression test for #1340 (updated by #1789):
 * TypographyPanel must have aria-label so screen readers announce the floating
 * settings panel, and trigger buttons must have aria-controls pointing to it.
 * role="dialog" was removed in #1789 — the panel is a non-modal popover; using
 * role="dialog" without aria-modal caused AT to roam behind the panel (WCAG 4.1.2).
 */
import * as fs from "fs";
import * as path from "path";

const panelSrc = fs.readFileSync(
  path.join(__dirname, "../components/TypographyPanel.tsx"),
  "utf8",
);

const readerSrc = fs.readFileSync(
  path.join(__dirname, "../app/reader/[bookId]/page.tsx"),
  "utf8",
);

describe("TypographyPanel accessible panel semantics (closes #1340)", () => {
  it("panel root has aria-label (no role=dialog — non-modal popover, see #1789)", () => {
    expect(panelSrc).toContain('aria-label="Typography settings"');
    // Verify role=dialog was removed; if present it must be accompanied by aria-modal
    const hasDialogRole = /role="dialog"/.test(panelSrc);
    if (hasDialogRole) {
      expect(panelSrc).toContain('aria-modal="true"');
    }
  });

  it('panel root has id="typography-panel"', () => {
    expect(panelSrc).toContain('id="typography-panel"');
  });

  it('reader trigger buttons have aria-controls="typography-panel"', () => {
    expect(readerSrc).toContain('aria-controls="typography-panel"');
  });
});
