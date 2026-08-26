import { readFileSync } from "fs";
import { join } from "path";

const decksDetailSrc = readFileSync(join(__dirname, "../app/decks/[deckId]/page.tsx"), "utf-8");
const annotationToolbarSrc = readFileSync(join(__dirname, "../components/AnnotationToolbar.tsx"), "utf-8");
const searchBarSrc = readFileSync(join(__dirname, "../components/SearchBar.tsx"), "utf-8");
const insightChatSrc = readFileSync(join(__dirname, "../components/InsightChat.tsx"), "utf-8");
const notesPageSrc = readFileSync(join(__dirname, "../app/notes/page.tsx"), "utf-8");
const vocabPageSrc = readFileSync(join(__dirname, "../app/vocabulary/page.tsx"), "utf-8");
const decksNewSrc = readFileSync(join(__dirname, "../app/decks/new/page.tsx"), "utf-8");
const profileSrc = readFileSync(join(__dirname, "../app/profile/page.tsx"), "utf-8");
const tagEditorSrc = readFileSync(join(__dirname, "../components/TagEditor.tsx"), "utf-8");
const queueTabSrc = readFileSync(join(__dirname, "../components/QueueTab.tsx"), "utf-8");
const adminUploadsSrc = readFileSync(join(__dirname, "../app/admin/uploads/page.tsx"), "utf-8");
const adminBooksSrc = readFileSync(join(__dirname, "../app/admin/books/page.tsx"), "utf-8");

function countOccurrences(src: string, pattern: RegExp): number {
  return (src.match(pattern) ?? []).length;
}

describe("Placeholder text contrast — WCAG 1.4.3", () => {
  it("decks/[deckId]/page.tsx should not use placeholder:text-stone-400 (2.4:1 on white, fails 4.5:1)", () => {
    expect(decksDetailSrc).not.toMatch(/placeholder:text-stone-400/);
  });

  it("AnnotationToolbar.tsx should not use placeholder:text-stone-400", () => {
    expect(annotationToolbarSrc).not.toMatch(/placeholder:text-stone-400/);
  });

  it("SearchBar.tsx should not use placeholder:text-stone-400", () => {
    expect(searchBarSrc).not.toMatch(/placeholder:text-stone-400/);
  });

  it("InsightChat.tsx should not use placeholder:text-gray-400 (2.3:1 on bg-gray-50, fails 4.5:1)", () => {
    expect(insightChatSrc).not.toMatch(/placeholder:text-gray-400/);
  });

  // --- inputs that previously lacked any explicit placeholder color (browser default ~3.95:1) ---

  it("notes/page.tsx search input must use placeholder:text-stone-600", () => {
    expect(countOccurrences(notesPageSrc, /placeholder:text-stone-600/g)).toBeGreaterThanOrEqual(1);
  });

  it("vocabulary/page.tsx search input must use placeholder:text-stone-600", () => {
    expect(countOccurrences(vocabPageSrc, /placeholder:text-stone-600/g)).toBeGreaterThanOrEqual(1);
  });

  // The homepage's Gutenberg search input is gone (#2711) — readers no longer
  // import books. The remaining search input on the page is SearchBar, covered above.

  it("decks/new/page.tsx must use placeholder:text-stone-600 on all 5 inputs", () => {
    expect(countOccurrences(decksNewSrc, /placeholder:text-stone-600/g)).toBeGreaterThanOrEqual(5);
  });

  it("profile/page.tsx must use placeholder:text-stone-600 on all 4 inputs", () => {
    expect(countOccurrences(profileSrc, /placeholder:text-stone-600/g)).toBeGreaterThanOrEqual(4);
  });

  it("TagEditor.tsx tag input must use placeholder:text-stone-600", () => {
    expect(countOccurrences(tagEditorSrc, /placeholder:text-stone-600/g)).toBeGreaterThanOrEqual(1);
  });

  // --- QueueTab and admin pages (wave 13) ---

  it("QueueTab.tsx must use placeholder:text-stone-600 on all 3 settings inputs", () => {
    expect(countOccurrences(queueTabSrc, /placeholder:text-stone-600/g)).toBeGreaterThanOrEqual(3);
  });

  it("admin/uploads/page.tsx filter input must use placeholder:text-stone-600", () => {
    expect(countOccurrences(adminUploadsSrc, /placeholder:text-stone-600/g)).toBeGreaterThanOrEqual(1);
  });

  it("admin/books/page.tsx must use placeholder:text-stone-600 on all 3 inputs", () => {
    expect(countOccurrences(adminBooksSrc, /placeholder:text-stone-600/g)).toBeGreaterThanOrEqual(3);
  });
});
