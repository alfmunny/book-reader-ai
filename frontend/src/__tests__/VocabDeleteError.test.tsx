/**
 * Regression test for #2134 — silent error in vocabulary delete.
 * When deleteVocabularyWord throws, the user must see an error message
 * with role="alert" (not a silent catch-and-ignore).
 */
import * as fs from "fs";
import * as path from "path";

const src = fs.readFileSync(
  path.join(__dirname, "../app/vocabulary/page.tsx"),
  "utf8",
);

test("handleDelete catch block sets an error state instead of silently ignoring", () => {
  // The catch block must not be a no-op comment — it should call a setter
  const catchIdx = src.indexOf("async function handleDelete");
  expect(catchIdx).toBeGreaterThan(-1);
  const fnSrc = src.slice(catchIdx, catchIdx + 400);
  // Must NOT contain bare "// ignore" with nothing else in the catch block
  expect(fnSrc).not.toMatch(/catch\s*\{[\s\n]*\/\/ ignore[\s\n]*\}/);
  // Must contain a setState call in the catch block
  expect(fnSrc).toMatch(/catch[\s\S]{0,60}set[A-Z][a-zA-Z]+\(/);
});

test("vocabulary page has a role=alert element for delete errors", () => {
  expect(src).toMatch(/role="alert"/);
  // The alert must be connected to a delete-related error state (not just fetchError)
  const alertIdx = src.search(/role="alert"[^>]*>[^<]*deleteError/);
  // Also accept the JSX pattern where deleteError is rendered inside the alert div
  const hasDeleteErrorAlert =
    alertIdx > -1 ||
    (() => {
      // Find all role="alert" occurrences and check if deleteError is nearby
      let i = 0;
      while (i < src.length) {
        const found = src.indexOf('role="alert"', i);
        if (found === -1) break;
        const region = src.slice(found, found + 200);
        if (region.includes("deleteError")) return true;
        i = found + 1;
      }
      return false;
    })();
  expect(hasDeleteErrorAlert).toBe(true);
});
