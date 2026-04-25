/**
 * Regression test for #1353: shared components and admin pages WCAG 1.4.3 contrast failures.
 * text-stone-400 on white = 2.65:1 — fails AA. text-stone-500 = 4.86:1 — passes.
 */
import * as fs from "fs";
import * as path from "path";

function read(rel: string) {
  return fs.readFileSync(path.join(__dirname, rel), "utf8");
}

const readingStats = read("../components/ReadingStats.tsx");
const queueTab = read("../components/QueueTab.tsx");
const annotationsSidebar = read("../components/AnnotationsSidebar.tsx");
const bookDetailModal = read("../components/BookDetailModal.tsx");
const vocabTooltip = read("../components/VocabWordTooltip.tsx");
const adminBooks = read("../app/admin/books/page.tsx");
const adminUploads = read("../app/admin/uploads/page.tsx");
const adminAudio = read("../app/admin/audio/page.tsx");
const adminUsers = read("../app/admin/users/page.tsx");

function noSmallStone400(src: string, label: string) {
  it(`${label} has no text-xs text-stone-400 (2.65:1 fail)`, () => {
    expect(src).not.toMatch(/text-xs[^"]*text-stone-400|text-stone-400[^"]*text-xs/);
  });
}

describe("Shared components and admin pages contrast (closes #1353)", () => {
  noSmallStone400(readingStats, "ReadingStats.tsx");
  noSmallStone400(queueTab, "QueueTab.tsx");
  noSmallStone400(annotationsSidebar, "AnnotationsSidebar.tsx");
  noSmallStone400(bookDetailModal, "BookDetailModal.tsx");
  noSmallStone400(vocabTooltip, "VocabWordTooltip.tsx");
  noSmallStone400(adminBooks, "admin/books/page.tsx");
  noSmallStone400(adminUploads, "admin/uploads/page.tsx");
  noSmallStone400(adminAudio, "admin/audio/page.tsx");
  noSmallStone400(adminUsers, "admin/users/page.tsx");

  it("QueueTab.tsx has no text-sm text-stone-400 (2.65:1 fail)", () => {
    expect(queueTab).not.toContain('"text-center text-stone-400');
    expect(queueTab).not.toContain('"text-sm text-stone-400');
  });

  it("admin/uploads/page.tsx has no text-sm text-stone-400 (2.65:1 fail)", () => {
    expect(adminUploads).not.toContain('"text-sm text-stone-400');
  });
});
