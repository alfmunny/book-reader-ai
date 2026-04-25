/**
 * Regression test for #1340: TypographyPanel must have role="dialog" and
 * aria-label so screen readers announce the floating settings panel, and
 * the reader trigger buttons must have aria-controls pointing to the panel.
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
  it('panel root has role="dialog"', () => {
    expect(panelSrc).toContain('role="dialog"');
  });

  it("panel root has aria-label", () => {
    expect(panelSrc).toContain('aria-label="Typography settings"');
  });

  it('panel root has id="typography-panel"', () => {
    expect(panelSrc).toContain('id="typography-panel"');
  });

  it('reader trigger buttons have aria-controls="typography-panel"', () => {
    expect(readerSrc).toContain('aria-controls="typography-panel"');
  });
});
