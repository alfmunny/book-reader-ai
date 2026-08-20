/**
 * Static-analysis test: reader Gemini reminder banner "Add a key in your profile"
 * button must have a focus-visible ring for keyboard accessibility (WCAG 2.4.7).
 */
import * as fs from "fs";
import * as path from "path";

const src = fs.readFileSync(
  path.resolve(__dirname, "../app/reader/[bookId]/page.tsx"),
  "utf-8",
);

describe("Reader Gemini banner focus ring", () => {
  it("'Add a key in your profile' button exists", () => {
    expect(src).toContain("Add a key in your profile");
  });

  it("button has focus:outline-none", () => {
    const idx = src.indexOf("Add a key in your profile");
    const window = src.slice(Math.max(0, idx - 300), idx + 50);
    expect(window).toContain("focus:outline-none");
  });

  it("button has focus-visible:ring-2", () => {
    const idx = src.indexOf("Add a key in your profile");
    const window = src.slice(Math.max(0, idx - 300), idx + 50);
    expect(window).toContain("focus-visible:ring-2");
  });

  it("button has focus-visible:ring-amber-400", () => {
    const idx = src.indexOf("Add a key in your profile");
    const window = src.slice(Math.max(0, idx - 300), idx + 50);
    expect(window).toContain("focus-visible:ring-amber-400");
  });
});
