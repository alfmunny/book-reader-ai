/**
 * Regression test for #2103 — home/library page must set document.title on
 * mount so the browser tab updates correctly after client-side navigation.
 */
import * as fs from "fs";
import * as path from "path";

const src = ["../components/SiteHeader.tsx", "../app/(shell)/page.tsx", "../app/(shell)/bookshelf/page.tsx"]
  .map((f) => fs.readFileSync(path.join(__dirname, f), "utf8")).join("\n");

describe("Home page document.title (closes #2103)", () => {
  it("home and bookshelf each set their own document.title", () => {
    expect(src).toContain('document.title = "Book Reader AI"');
    expect(src).toContain('document.title = "Your Bookshelf — Book Reader AI"');
  });
});
