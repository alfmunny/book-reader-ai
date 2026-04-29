/**
 * Regression test for #2152 — SearchBar form container must have a focus-within
 * ring so keyboard users see a visible focus indicator when the input is focused.
 * WCAG 2.4.7 (Focus Visible, Level AA).
 */
import * as fs from "fs";
import * as path from "path";

const src = fs.readFileSync(
  path.join(__dirname, "../components/SearchBar.tsx"),
  "utf8",
);

describe("SearchBar focus ring (closes #2152)", () => {
  it("form container has focus-within:ring-2 for visible focus indicator", () => {
    expect(src).toMatch(/focus-within:ring-2/);
  });

  it("form container has focus-within:ring-amber-400 to match design tokens", () => {
    expect(src).toMatch(/focus-within:ring-amber-400/);
  });
});
