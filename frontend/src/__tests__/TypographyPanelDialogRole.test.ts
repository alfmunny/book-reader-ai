/**
 * Accessibility regression for issue #1789:
 * TypographyPanel used role="dialog" without aria-modal="true", causing
 * screen readers to roam page content behind the panel (WCAG 4.1.2 Level A).
 * Fix: remove role="dialog"; the panel is a non-modal settings popover —
 * no role annotation is needed (aria-label is sufficient).
 */
import * as fs from "fs";
import * as path from "path";

const src = fs.readFileSync(
  path.join(__dirname, "../components/TypographyPanel.tsx"),
  "utf8",
);

describe("TypographyPanel dialog role (closes #1789)", () => {
  it("does not use role=dialog without aria-modal", () => {
    const hasDialogRole = /role="dialog"/.test(src);
    const hasAriaModal = /aria-modal="true"/.test(src);
    // Either no role=dialog, or role=dialog accompanied by aria-modal=true
    if (hasDialogRole) {
      expect(hasAriaModal).toBe(true);
    } else {
      expect(hasDialogRole).toBe(false);
    }
  });
});
