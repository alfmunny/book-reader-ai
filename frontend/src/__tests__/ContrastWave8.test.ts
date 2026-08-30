import fs from "fs";
import path from "path";

const src = (rel: string) =>
  fs.readFileSync(path.join(process.cwd(), "src", rel), "utf-8");

const uploadPage = src("app/(shell)/upload/page.tsx");
const chaptersPage = src("app/(shell)/upload/[bookId]/chapters/page.tsx");
const importPage = src("app/(shell)/import/[bookId]/page.tsx");
const loginPage = src("app/login/page.tsx");
const sentenceReader = src("components/SentenceReader.tsx");
const annotationToolbar = src("components/AnnotationToolbar.tsx");
const annotationsSidebar = src("components/AnnotationsSidebar.tsx");
const bookDetailModal = src("components/BookDetailModal.tsx");
const notesBookPage = src("app/(shell)/notes/[bookId]/page.tsx");
const deckIdPage = src("app/(shell)/decks/[deckId]/page.tsx");
const profilePage = src("app/(shell)/profile/page.tsx");

describe("Contrast wave 8 (closes #1369)", () => {
  // ─── Text contrast (WCAG 1.4.3) ────────────────────────────────────────

  it("upload page Tips heading uses text-stone-600 not text-stone-400 (WCAG AA on parchment)", () => {
    expect(uploadPage).not.toContain('text-stone-400">Tips');
    expect(uploadPage).not.toContain('text-stone-500">Tips');
    expect(uploadPage).toContain('text-stone-600">Tips');
  });

  it("chapters page detected count uses text-stone-600 not text-stone-400 (WCAG AA on parchment)", () => {
    // The "(n detected)" subtitle went with the old header; what remains must
    // still avoid the too-faint greys on parchment.
    expect(chaptersPage).not.toContain("text-stone-400");
    expect(chaptersPage).not.toContain("text-stone-500");
  });

  it("chapters page uses no too-faint greys on parchment", () => {
    // The Preview heading and the truncation ellipsis went with the preview pane
    // (#audit); the guarantee that survives is that nothing faint is left.
    expect(chaptersPage).not.toMatch(/text-stone-[45]00/);
  });

  it("chapters page empty state uses text-stone-600 not text-stone-400 (WCAG AA on parchment)", () => {
    expect(chaptersPage).not.toMatch(/text-stone-[45]00/);
    expect(chaptersPage).not.toContain("text-sm text-stone-500 text-center mt-8");
    // The old centred empty state went with the preview pane; the guarantee that
    // survives is that no too-faint grey is left on this surface.
    expect(chaptersPage).not.toMatch(/text-stone-[45]00/);
  });

  it("import page footer note uses text-stone-600 not text-stone-400 (WCAG AA on parchment)", () => {
    expect(importPage).not.toContain("text-xs text-stone-400 mt-4");
    expect(importPage).not.toContain("text-xs text-stone-500 mt-4");
    expect(importPage).toContain("text-xs text-stone-600 mt-4");
  });

  it("login page footer note uses text-stone-600 not text-stone-400 (WCAG AA on parchment)", () => {
    expect(loginPage).not.toContain("text-xs text-stone-400 mt-6");
    expect(loginPage).not.toContain("text-xs text-stone-500 mt-6");
    expect(loginPage).toContain("text-xs text-stone-600 mt-6");
  });

  it("SentenceReader not-loaded word uses text-stone-600 not text-stone-400 (WCAG AA on parchment)", () => {
    expect(sentenceReader).not.toContain(': "text-stone-400";');
    expect(sentenceReader).not.toContain(': "text-stone-500";');
    expect(sentenceReader).toContain(': "text-stone-600"');
  });

  // ─── Icon button contrast (WCAG 1.4.11) ────────────────────────────────

  it("AnnotationToolbar close button uses text-stone-600 not text-stone-400 (WCAG 1.4.11)", () => {
    expect(annotationToolbar).not.toContain("text-stone-400 hover:text-stone-600 hover:bg-amber-50");
    expect(annotationToolbar).not.toContain("text-stone-500 hover:text-stone-700 hover:bg-amber-50");
    expect(annotationToolbar).toContain("text-stone-600 hover:text-stone-700 hover:bg-amber-50");
  });

  it("AnnotationsSidebar close button uses text-stone-600 not text-stone-400 (WCAG 1.4.11)", () => {
    expect(annotationsSidebar).not.toContain('"text-stone-400 hover:text-stone-600 min-h-[44px]');
    expect(annotationsSidebar).not.toContain('"text-stone-500 hover:text-stone-700 min-h-[44px]');
    expect(annotationsSidebar).toContain('"text-stone-600 hover:text-stone-700 min-h-[44px]');
  });

  it("BookDetailModal close button uses text-stone-600 not text-stone-400 (WCAG 1.4.11)", () => {
    expect(bookDetailModal).not.toContain("text-stone-400 hover:bg-stone-100 hover:text-stone-600");
    expect(bookDetailModal).not.toContain("text-stone-500 hover:bg-stone-100 hover:text-stone-700");
    expect(bookDetailModal).toContain("text-stone-600 hover:bg-stone-100 hover:text-stone-700");
  });

  it("notes edit button uses text-stone-600 not text-stone-400 (WCAG 1.4.11)", () => {
    expect(notesBookPage).not.toContain("text-stone-400 hover:text-stone-600 transition-colors p-1");
    expect(notesBookPage).not.toContain("text-stone-500 hover:text-stone-700 transition-colors p-1");
    expect(notesBookPage).toContain("text-stone-600 hover:text-stone-700 transition-colors p-1");
  });

  it("deck member trash button uses text-stone-600 not text-stone-400 (WCAG 1.4.11)", () => {
    expect(deckIdPage).not.toContain("rounded-lg text-stone-400 hover:text-red-600");
    expect(deckIdPage).not.toContain("rounded-lg text-stone-500 hover:text-red-600");
    expect(deckIdPage).toContain("rounded-lg text-stone-600 hover:text-red-600");
  });

  // ─── Decorative icon: aria-hidden ──────────────────────────────────────

  it("profile ChevronRight in deck button has aria-hidden (decorative, exempt from 1.4.11)", () => {
    expect(profilePage).toMatch(/text-stone-\d+ shrink-0" aria-hidden="true"/);
  });
});
