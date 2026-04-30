/**
 * Regression test for #2495:
 * The inline spinner role="status" in QueueTab must not have an empty
 * aria-label when not loading — empty strings are invalid accessible names
 * per ARIA spec (WCAG 4.1.2).
 */
import * as fs from "fs";
import * as path from "path";

const src = fs.readFileSync(
  path.join(__dirname, "../components/QueueTab.tsx"),
  "utf8",
);

describe("QueueTab inline spinner aria-label (closes #2495)", () => {
  it("spinner role=status does not use empty string as aria-label when not loading", () => {
    // The old (bad) pattern: aria-label={loadingItems ? "Loading items" : ""}
    // The fix uses `undefined` so the attribute is omitted when empty.
    const spinnerRegion = src.slice(
      src.indexOf("Spinner slot has fixed width"),
      src.indexOf("Spinner slot has fixed width") + 400,
    );
    // Must NOT have the pattern that produces an empty string label
    expect(spinnerRegion).not.toMatch(/aria-label=\{loadingItems \? "[^"]*" : ""\}/);
  });

  it("spinner role=status has a meaningful label when loading", () => {
    const spinnerRegion = src.slice(
      src.indexOf("Spinner slot has fixed width"),
      src.indexOf("Spinner slot has fixed width") + 400,
    );
    // Must still have a label that references loadingItems / "Loading items"
    expect(spinnerRegion).toMatch(/aria-label=.*[Ll]oading/);
  });
});
