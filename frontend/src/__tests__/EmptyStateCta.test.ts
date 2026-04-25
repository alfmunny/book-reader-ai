/**
 * Static assertions: empty states in vocabulary and notes overview pages have CTA buttons.
 * Closes #1090
 */
import fs from "fs";
import path from "path";

const vocabPage = fs.readFileSync(
  path.join(process.cwd(), "src/app/vocabulary/page.tsx"),
  "utf8",
);

const notesOverviewPage = fs.readFileSync(
  path.join(process.cwd(), "src/app/notes/page.tsx"),
  "utf8",
);

describe("EmptyStateCta", () => {
  it("vocabulary empty state has a Browse books CTA button", () => {
    // Look for the empty state block + a button that navigates to library
    expect(vocabPage).toContain('No saved words yet');
    expect(vocabPage).toMatch(/Browse books|Discover books/);
  });

  it("vocabulary empty state CTA navigates to home/library", () => {
    // Empty state CTA should call router.push("/")
    const idx = vocabPage.indexOf('No saved words yet');
    expect(idx).toBeGreaterThan(0);
    const after = vocabPage.slice(idx, idx + 1500);
    expect(after).toMatch(/router\.push\("\/"\)/);
  });

  it("notes overview empty state has a Browse books CTA button", () => {
    expect(notesOverviewPage).toContain('No notes yet');
    expect(notesOverviewPage).toMatch(/Browse books|Discover books/);
  });

  it("notes overview empty state CTA navigates to home/library", () => {
    const idx = notesOverviewPage.indexOf('No notes yet');
    expect(idx).toBeGreaterThan(0);
    const after = notesOverviewPage.slice(idx, idx + 1500);
    expect(after).toMatch(/router\.push\("\/"\)/);
  });
});
