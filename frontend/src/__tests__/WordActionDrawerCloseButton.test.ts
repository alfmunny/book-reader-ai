/**
 * Regression test for #2069: WordActionDrawer must have a visible close button
 * with an aria-label so keyboard and screen-reader users can dismiss it.
 */
import * as fs from "fs";
import * as path from "path";

const src = fs.readFileSync(
  path.join(__dirname, "../components/WordActionDrawer.tsx"),
  "utf8"
);

describe("WordActionDrawer close button (WCAG 2.1.1, closes #2069)", () => {
  it("imports CloseIcon", () => {
    expect(src).toMatch(/CloseIcon/);
  });

  it("has a close button with aria-label", () => {
    expect(src).toMatch(/aria-label="Close word lookup"/);
  });

  it("close button uses CloseIcon", () => {
    const block = src.match(
      /aria-label="Close word lookup"[\s\S]{0,200}CloseIcon|CloseIcon[\s\S]{0,200}aria-label="Close word lookup"/
    );
    expect(block).not.toBeNull();
  });
});
