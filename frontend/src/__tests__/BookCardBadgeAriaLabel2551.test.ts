/**
 * Regression tests for #2551:
 * BookCard aria-label must include badge content so screen reader users
 * get chapter/time info — aria-label overrides button text in the AT tree.
 */
import fs from "fs";
import path from "path";

const src = fs.readFileSync(
  path.resolve(__dirname, "..", "components/BookCard.tsx"),
  "utf-8"
);

describe("BookCard aria-label includes badge content (closes #2551)", () => {
  it("badge is appended conditionally in the aria-label template", () => {
    // The aria-label must include a ternary referencing badge — pattern:
    //   ${badge ? `...${badge}...` : ""}  or  ${badge ? ` — ${badge}` : ""}
    expect(src).toMatch(/\$\{badge\s*\?[\s\S]{0,30}badge[\s\S]{0,10}:\s*""\}/);
  });

  it("aria-label template literal references badge near the Open prefix", () => {
    // Find the aria-label on the open-book button and confirm badge appears
    // within 200 chars of 'Open ${book.title}'
    const openIdx = src.indexOf("Open ${book.title}");
    expect(openIdx).not.toBe(-1);
    const labelContext = src.slice(openIdx, openIdx + 200);
    expect(labelContext).toContain("badge");
  });
});
