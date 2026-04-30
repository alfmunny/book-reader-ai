/**
 * Regression test for #2519:
 * The chapter preview panel in the upload flow has overflow-y-auto but no
 * tabIndex={0}, making it unreachable by keyboard. WCAG 2.1.1 Keyboard (Level A).
 */
import fs from "fs";
import path from "path";

const src = fs.readFileSync(
  path.resolve(__dirname, "../app/upload/[bookId]/chapters/page.tsx"),
  "utf-8",
);

describe("Upload chapter preview panel — WCAG 2.1.1 (closes #2519)", () => {
  it("preview panel has tabIndex={0} for keyboard scroll access", () => {
    // The overflow-y-auto preview div must have tabIndex={0}
    const regex =
      /overflow-y-auto[^>]*tabIndex=\{0\}|tabIndex=\{0\}[^>]*overflow-y-auto/;
    expect(src).toMatch(regex);
  });
});
