/**
 * Regression test for #1997 — chapter load error div must have role="alert"
 * so screen readers announce it when the error state is dynamically rendered.
 *
 * This is a source-level check for a static markup attribute: role="alert"
 * on a conditionally-rendered div is not a runtime behaviour that requires
 * component rendering to verify — it's a guaranteed-present attribute check.
 */
import * as fs from "fs";
import * as path from "path";

const src = fs.readFileSync(
  path.resolve(__dirname, "../app/reader/[bookId]/page.tsx"),
  "utf8",
);

test("chapter load error container has role='alert'", () => {
  // Find the error state block — it contains "Failed to load chapter"
  const idx = src.indexOf("Failed to load chapter");
  expect(idx).toBeGreaterThan(-1);

  // Walk back to the opening div of this block (within 300 chars)
  const context = src.slice(Math.max(0, idx - 300), idx);

  // The nearest <div before the error heading must include role="alert"
  const lastDivIdx = context.lastIndexOf("<div");
  const divToHeading = context.slice(lastDivIdx);
  expect(divToHeading).toContain('role="alert"');
});
