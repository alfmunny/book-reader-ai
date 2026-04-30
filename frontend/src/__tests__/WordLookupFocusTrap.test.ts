/**
 * Regression tests for #2352: WordLookup dialog missing focus trap and
 * auto-focus on open (WCAG 2.4.3 — Focus Order).
 *
 * Other dialogs (BookDetailModal, WordActionDrawer, AnnotationToolbar) all
 * use useFocusTrap + tabIndex={-1} + dialogRef.current?.focus(). WordLookup
 * was missing these patterns.
 */
import * as fs from "fs";
import * as path from "path";

const src = fs.readFileSync(
  path.join(__dirname, "../components/WordLookup.tsx"),
  "utf8",
);

describe("WordLookup dialog focus management (closes #2352)", () => {
  it("imports useFocusTrap", () => {
    expect(src).toContain("useFocusTrap");
  });

  it("dialog container has tabIndex={-1} for programmatic focus", () => {
    const idx = src.indexOf('role="dialog"');
    expect(idx).toBeGreaterThan(-1);
    const window = src.slice(Math.max(0, idx - 100), idx + 200);
    expect(window).toContain("tabIndex={-1}");
  });

  it("dialog container has focus:outline-none", () => {
    const idx = src.indexOf('role="dialog"');
    expect(idx).toBeGreaterThan(-1);
    const window = src.slice(Math.max(0, idx - 100), idx + 300);
    expect(window).toContain("focus:outline-none");
  });

  it("calls useFocusTrap with the ref", () => {
    expect(src).toMatch(/useFocusTrap\(ref\)/);
  });

  it("auto-focuses dialog on mount and restores focus on close", () => {
    // The useEffect that moves focus should call ref.current?.focus()
    expect(src).toContain("ref.current?.focus()");
    // And restore previouslyFocused?.focus()
    expect(src).toContain("previouslyFocused?.focus");
  });
});
