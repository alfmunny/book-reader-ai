/**
 * Regression test for #2591:
 * When a flashcard is flipped (answer revealed), the first grade button must
 * receive focus so keyboard/Tab-navigation users don't lose their position
 * (WCAG 2.4.3 Focus Order).
 *
 * Tests use static source-code analysis (fs.readFileSync) because focus
 * management via useEffect/useRef is structural code that doesn't require DOM.
 */
import * as fs from "fs";
import * as path from "path";

const src = fs.readFileSync(
  path.join(__dirname, "../app/vocabulary/flashcards/page.tsx"),
  "utf8",
);

describe("Flashcard grade-button focus on flip (closes #2591)", () => {
  it("declares a firstGradeRef useRef for the first grade button", () => {
    expect(src).toMatch(/firstGradeRef\s*=\s*useRef/);
  });

  it("attaches firstGradeRef to the first grade button (index 0)", () => {
    // The ref must appear somewhere in the grade-button JSX
    expect(src).toMatch(/firstGradeRef/);
    // ref must be wired to firstGradeRef (directly or via conditional on i === 0)
    expect(src).toMatch(/ref=\{.*firstGradeRef.*\}/);
  });

  it("has a useEffect that focuses firstGradeRef when flipped becomes true", () => {
    // Must have a useEffect that calls firstGradeRef.current?.focus()
    expect(src).toMatch(/firstGradeRef\.current\?\.focus\(\)/);
    // Must be conditional on flipped being true
    expect(src).toMatch(/if\s*\(\s*flipped/);
  });

  it("useEffect dep array includes flipped so it fires on flip transition", () => {
    // Find the focus effect and check its dependency array contains flipped
    const focusEffectIdx = src.indexOf("firstGradeRef.current?.focus()");
    expect(focusEffectIdx).not.toBe(-1);
    // Search nearby context (up to 300 chars around the focus call) for [flipped
    const context = src.slice(Math.max(0, focusEffectIdx - 200), focusEffectIdx + 200);
    expect(context).toMatch(/\[\s*flipped/);
  });
});
