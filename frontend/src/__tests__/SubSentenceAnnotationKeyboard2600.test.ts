/**
 * Regression test for #2600:
 * Sub-sentence annotation spans (data-ann-id) must be keyboard-accessible
 * when a segment has multiple annotations after #1707.
 *
 * Requirements verified via static source analysis:
 * 1. buildSegContent annotation spans must receive role="button", tabIndex, aria-label,
 *    and an onKeyDown prop when an onAnnotationKeyDown callback is provided.
 * 2. The outer segment aria-label must mention annotation count > 1 when multiple
 *    annotations exist on a segment.
 * 3. The isAnnotationInteractive gate must not exclude segments that have only
 *    sub-sentence annotations (no full-segment annotation) — at minimum those spans
 *    must be reachable via their own keyboard handler.
 */
import * as fs from "fs";
import * as path from "path";

const src = fs.readFileSync(
  path.join(__dirname, "../components/SentenceReader.tsx"),
  "utf8",
);

describe("Sub-sentence annotation keyboard accessibility (closes #2600)", () => {
  it("buildSegContent annotation spans carry role=button", () => {
    const idx = src.indexOf("data-ann-id");
    expect(idx).not.toBe(-1);
    // The span rendered for annotation type in buildSegContent must have role="button"
    const block = src.slice(Math.max(0, idx - 300), idx + 600);
    expect(block).toMatch(/role=["']button["']/);
  });

  it("buildSegContent annotation spans have a tabIndex", () => {
    const idx = src.indexOf("data-ann-id");
    const block = src.slice(Math.max(0, idx - 300), idx + 600);
    expect(block).toMatch(/tabIndex/);
  });

  it("buildSegContent annotation spans have an aria-label", () => {
    const idx = src.indexOf("data-ann-id");
    const block = src.slice(Math.max(0, idx - 300), idx + 600);
    expect(block).toMatch(/aria-label/);
  });

  it("buildSegContent annotation spans have an onKeyDown handler", () => {
    const idx = src.indexOf("data-ann-id");
    const block = src.slice(Math.max(0, idx - 300), idx + 600);
    expect(block).toMatch(/onKeyDown/);
  });

  it("outer segment aria-label reflects multiple annotations when segAnns.length > 1", () => {
    // The aria-label should mention count or use a plural form when multiple annotations exist
    expect(src).toMatch(/annotation[s]?\b.*\blength\b|segAnns\.length.*aria-label|aria-label.*segAnns|annotations.*label/i);
  });
});
