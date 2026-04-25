/**
 * Static assertions: skip-to-main-content link exists in layout and a few
 * top-level pages add the matching anchor id.
 * Closes #1179
 */
import fs from "fs";
import path from "path";

function read(rel: string): string {
  return fs.readFileSync(path.join(process.cwd(), rel), "utf8");
}

describe("Skip-to-main-content", () => {
  it("layout includes a skip-to-content anchor", () => {
    const src = read("src/app/layout.tsx");
    expect(src).toMatch(/href="#main-content"/);
    expect(src).toMatch(/Skip to main content/);
  });

  it("home page <main> has id=main-content", () => {
    const src = read("src/app/page.tsx");
    expect(src).toMatch(/<main[^>]*id="main-content"/);
  });

  it("notes page <main> has id=main-content", () => {
    const src = read("src/app/notes/page.tsx");
    expect(src).toMatch(/<main[^>]*id="main-content"/);
  });

  it("vocabulary page <main> has id=main-content", () => {
    const src = read("src/app/vocabulary/page.tsx");
    expect(src).toMatch(/<main[^>]*id="main-content"/);
  });
});
