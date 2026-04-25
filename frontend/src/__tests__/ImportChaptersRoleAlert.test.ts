/**
 * Static assertions: import + chapters error states have role=alert.
 * Closes #1155
 */
import fs from "fs";
import path from "path";

const importPage = fs.readFileSync(
  path.join(process.cwd(), "src/app/import/[bookId]/page.tsx"),
  "utf8",
);
const chaptersPage = fs.readFileSync(
  path.join(process.cwd(), "src/app/upload/[bookId]/chapters/page.tsx"),
  "utf8",
);

describe("Import + chapters error states", () => {
  it("import translateError block has role=alert", () => {
    const idx = importPage.indexOf("{translateError &&");
    expect(idx).toBeGreaterThan(0);
    const block = importPage.slice(idx, idx + 500);
    expect(block).toContain('role="alert"');
  });

  it("import error block has role=alert", () => {
    // The 'error' state block (different from translateError)
    const idx = importPage.indexOf("bg-red-50 border border-red-200 text-red-700 rounded-lg");
    expect(idx).toBeGreaterThan(0);
    const block = importPage.slice(Math.max(0, idx - 300), idx + 100);
    expect(block).toContain('role="alert"');
  });

  it("chapters Could-not-load block has role=alert", () => {
    const idx = chaptersPage.indexOf("Could not load chapters");
    expect(idx).toBeGreaterThan(0);
    const block = chaptersPage.slice(Math.max(0, idx - 300), idx + 100);
    expect(block).toContain('role="alert"');
  });

  it("chapters in-page error banner has role=alert", () => {
    const idx = chaptersPage.indexOf("rounded-lg border border-red-200 bg-red-50");
    expect(idx).toBeGreaterThan(0);
    // role=alert is on the same div, just before className
    const block = chaptersPage.slice(Math.max(0, idx - 200), idx + 200);
    expect(block).toContain('role="alert"');
  });
});
