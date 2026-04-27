import * as fs from "fs";
import * as path from "path";

// Closes #364 (#UX-001). The mobile sub-sentence-selection gap was
// caused by SentenceReader calling e.preventDefault() inside the touch
// branch of handleSegLongPress, which suppressed the browser's native
// selection loupe and made it impossible to drag-select sub-phrases on
// mobile. Per docs/design-improvement-plan.md "#364 — Mobile sub-
// sentence selection", motion-based gesture disambiguation makes the
// preventDefault unnecessary: the existing pointermove >10px cancel
// routes drag gestures to native selection, while a still hold for
// 500ms still triggers the word-action drawer.

const src = fs.readFileSync(
  path.join(__dirname, "../components/SentenceReader.tsx"),
  "utf8",
);

describe("SentenceReader touch selection gap (closes #364)", () => {
  it("does not pair pointerType==='touch' with preventDefault()", () => {
    // Reject any line that gates preventDefault() on touch pointerType.
    expect(src).not.toMatch(/pointerType\s*===\s*"touch"[\s\S]{0,80}preventDefault\s*\(/);
    expect(src).not.toMatch(/preventDefault\s*\([\s\S]{0,80}pointerType\s*===\s*"touch"/);
  });
});
