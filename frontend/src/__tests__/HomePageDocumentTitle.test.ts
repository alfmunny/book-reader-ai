/**
 * Regression test for #2103 — home/library page must set document.title on
 * mount so the browser tab updates correctly after client-side navigation.
 */
import * as fs from "fs";
import * as path from "path";

const src = fs.readFileSync(
  path.join(__dirname, "../app/page.tsx"),
  "utf8",
);

describe("Home page document.title (closes #2103)", () => {
  it("sets document.title to 'My Library — Book Reader AI'", () => {
    expect(src).toContain('document.title = "My Library — Book Reader AI"');
  });
});
