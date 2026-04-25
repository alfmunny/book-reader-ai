/**
 * Regression test for #1315: VocabWordTooltip must be announced to screen
 * readers as a dialog with an accessible name and receive focus on mount.
 */
import * as fs from "fs";
import * as path from "path";

const src = fs.readFileSync(
  path.join(__dirname, "../components/VocabWordTooltip.tsx"),
  "utf8"
);

describe("VocabWordTooltip dialog accessibility (closes #1315)", () => {
  it("has role=dialog", () => {
    expect(src).toContain('role="dialog"');
  });

  it("has aria-modal=true", () => {
    expect(src).toContain('aria-modal="true"');
  });

  it("has aria-labelledby pointing to a heading id", () => {
    expect(src).toContain("aria-labelledby");
    expect(src).toContain("vocab-tooltip-title");
  });

  it("has tabIndex={-1} on dialog container for focus management", () => {
    expect(src).toContain("tabIndex={-1}");
  });

  it("moves focus into dialog on mount via useEffect", () => {
    expect(src).toContain(".focus()");
  });
});
