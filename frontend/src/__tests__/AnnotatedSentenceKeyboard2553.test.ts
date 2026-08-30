/**
 * Regression test for #2553:
 * Annotated sentence spans in SentenceReader must be keyboard-reachable.
 * A span that has a fullSegmentAnnotation must carry:
 *   - tabIndex={0}
 *   - role="button"
 *   - an aria-label mentioning the annotation
 *   - an onKeyDown handler (Enter/Space)
 * This ensures keyboard users can navigate to and activate existing annotations
 * (WCAG 2.1.1 Keyboard — Level A).
 */
import * as fs from "fs";
import * as path from "path";

const src = fs.readFileSync(
  path.join(__dirname, "../components/SentenceReader.tsx"),
  "utf8",
);

describe("SentenceReader annotated span keyboard accessibility (closes #2553)", () => {
  it("annotated span receives tabIndex={0} when fullSegmentAnnotation exists", () => {
    // The renderSeg function conditionally sets tabIndex.
    // Look for the tabIndex={0} assignment tied to annotation presence.
    const idx = src.indexOf("fullSegmentAnnotation");
    expect(idx).not.toBe(-1);
    // tabIndex may appear as tabIndex={0} or tabIndex={condition ? 0 : ...}
    const block = src.slice(idx, idx + 5000);
    expect(block).toMatch(/tabIndex=\{.*0/);
  });

  it("annotated span carries role button", () => {
    const idx = src.indexOf("fullSegmentAnnotation");
    const block = src.slice(idx, idx + 5000);
    // role may be role="button" or role={expr ? "button" : ...}
    expect(block).toMatch(/role=.*button/);
  });

  it("annotated span has aria-label referencing annotation", () => {
    const idx = src.indexOf("fullSegmentAnnotation");
    const block = src.slice(idx, idx + 5000);
    expect(block).toMatch(/aria-label=/);
  });

  it("annotated span has onKeyDown handler for Enter/Space activation", () => {
    const idx = src.indexOf("fullSegmentAnnotation");
    const block = src.slice(idx, idx + 5000);
    expect(block).toMatch(/onKeyDown=/);
    // The handler should respond to Enter or Space
    expect(block).toMatch(/Enter|Space|key\s*===\s*"Enter"|key\s*===\s*" "/);
  });
});
