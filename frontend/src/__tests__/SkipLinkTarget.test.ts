import fs from "fs";
import path from "path";

const src = (rel: string) =>
  fs.readFileSync(path.join(process.cwd(), "src", rel), "utf-8");

const errorPage = src("app/error.tsx");
const notFoundPage = src("app/not-found.tsx");
const uploadPage = src("app/upload/page.tsx");
const chaptersPage = src("app/upload/[bookId]/chapters/page.tsx");

describe("Skip navigation link target (WCAG 2.4.1) (closes #1371)", () => {
  it("error.tsx <main> has id=main-content so skip link target exists", () => {
    expect(errorPage).toContain('id="main-content"');
  });

  it("not-found.tsx <main> has id=main-content so skip link target exists", () => {
    expect(notFoundPage).toContain('id="main-content"');
  });

  it("upload/page.tsx unauthenticated state <main> has id=main-content", () => {
    // The file should contain at least two occurrences: unauthenticated state + main content state
    const matches = uploadPage.match(/id="main-content"/g) ?? [];
    expect(matches.length).toBeGreaterThanOrEqual(2);
  });

  it("upload/[bookId]/chapters/page.tsx error state <main> has id=main-content", () => {
    expect(chaptersPage).toContain('id="main-content"');
  });
});
