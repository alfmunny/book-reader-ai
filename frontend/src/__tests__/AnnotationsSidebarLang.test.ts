/**
 * Static source analysis: AnnotationsSidebar sentence_text and reader notes-expand panel
 * both carry lang attribute — WCAG 3.1.2 Language of Parts (closes #2275)
 */
import * as fs from "fs";
import * as path from "path";

const SRC_ROOT = path.resolve(__dirname, "..");
const sidebarSrc = fs.readFileSync(
  path.join(SRC_ROOT, "components/AnnotationsSidebar.tsx"),
  "utf8"
);
const readerSrc = fs.readFileSync(
  path.join(SRC_ROOT, "app/reader/[bookId]/page.tsx"),
  "utf8"
);

describe("AnnotationsSidebar WCAG 3.1.2 lang (issue #2275)", () => {
  it("AnnotationsSidebar Props interface includes bookLanguage", () => {
    const ifaceIdx = sidebarSrc.indexOf("interface Props");
    expect(ifaceIdx).toBeGreaterThan(-1);
    const block = sidebarSrc.slice(ifaceIdx, ifaceIdx + 600);
    expect(block).toMatch(/bookLanguage\??\s*:/);
  });

  it("AnnotationsSidebar sentence_text <p> has lang={bookLanguage}", () => {
    // Anchor on the unique className string for the sentence preview paragraph
    const anchor = sidebarSrc.indexOf('"text-xs italic leading-relaxed line-clamp-3 flex-1"');
    expect(anchor).toBeGreaterThan(-1);
    const before = sidebarSrc.slice(Math.max(0, anchor - 80), anchor);
    expect(before).toMatch(/lang=\{bookLanguage/);
  });
});

describe("Reader notes-expand panel WCAG 3.1.2 lang (issue #2275)", () => {
  it("notes-expand panel sentence_text div has lang={bookLanguage}", () => {
    // Anchor on the unique className string for the notes-expand item
    const anchor = readerSrc.indexOf('"text-ink line-clamp-2"');
    expect(anchor).toBeGreaterThan(-1);
    const before = readerSrc.slice(Math.max(0, anchor - 80), anchor);
    expect(before).toMatch(/lang=\{bookLanguage/);
  });
});
