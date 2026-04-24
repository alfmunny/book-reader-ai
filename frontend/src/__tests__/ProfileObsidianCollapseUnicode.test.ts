/**
 * Regression test for issue #804 — profile page Obsidian collapse toggle
 * uses ▶ Unicode instead of ChevronRightIcon from Icons.tsx.
 */
import fs from "fs";
import path from "path";

const src = fs.readFileSync(
  path.join(__dirname, "../app/profile/page.tsx"),
  "utf-8"
);

describe("Profile Obsidian collapse icon (#804)", () => {
  it("does not use ▶ Unicode character", () => {
    expect(src).not.toMatch(/[▶]/);
  });

  it("imports ChevronRightIcon from Icons", () => {
    expect(src).toMatch(/ChevronRightIcon/);
  });

  it("ChevronRightIcon has aria-hidden on collapse toggle", () => {
    expect(src).toMatch(/ChevronRightIcon[\s\S]{0,200}aria-hidden/);
  });

  it("collapse toggle uses rotate-90 transition", () => {
    expect(src).toMatch(/ChevronRightIcon[\s\S]{0,200}rotate-90/);
  });
});
