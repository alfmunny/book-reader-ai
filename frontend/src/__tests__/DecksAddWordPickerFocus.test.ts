/**
 * Regression test for #1880: AddWordPicker dialog must restore focus to the
 * trigger element on unmount (WCAG 2.4.3 Focus Order).
 *
 * The fix captures document.activeElement before moving focus to the close
 * button, then restores it in the useEffect cleanup.
 */
import fs from "fs";
import path from "path";

const src = fs.readFileSync(
  path.join(process.cwd(), "src/app/decks/[deckId]/page.tsx"),
  "utf8",
);

describe("AddWordPicker dialog focus restoration (#1880)", () => {
  it("captures previous focus before taking focus (WCAG 2.4.3)", () => {
    // The useEffect that focuses closeRef must save document.activeElement first
    const idx = src.indexOf("closeRef.current?.focus()");
    expect(idx).toBeGreaterThan(-1);
    // Look 200 chars before the focus call for the prev capture
    const before = src.slice(Math.max(0, idx - 200), idx);
    expect(before).toContain("document.activeElement");
  });

  it("restores focus via useEffect cleanup", () => {
    // The cleanup function must call prev?.focus?.()
    const idx = src.indexOf("closeRef.current?.focus()");
    expect(idx).toBeGreaterThan(-1);
    // Look after the focus call for the cleanup
    const after = src.slice(idx, idx + 150);
    expect(after).toContain("prev?.focus");
  });
});
