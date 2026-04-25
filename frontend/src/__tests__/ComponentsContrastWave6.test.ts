import fs from "fs";
import path from "path";

const readSrc = (name: string) =>
  fs.readFileSync(path.resolve(__dirname, `../components/${name}`), "utf8");

const readingStats    = readSrc("ReadingStats.tsx");
const annotationTb    = readSrc("AnnotationToolbar.tsx");
const vocabTooltip    = readSrc("VocabWordTooltip.tsx");
const deckCard        = readSrc("DeckCard.tsx");
const chapterSummary  = readSrc("ChapterSummary.tsx");

describe("Component contrast wave 6 (closes #1362)", () => {
  it("ReadingStats heatmap month labels use text-stone-500 not text-stone-400", () => {
    expect(readingStats).not.toContain("text-[9px] text-stone-400");
    expect(readingStats).toContain("text-[9px] text-stone-500");
  });

  it("ReadingStats legend Less/More use text-stone-500 not text-stone-400", () => {
    expect(readingStats).not.toContain('"text-[9px] text-stone-400 mr-1"');
    expect(readingStats).not.toContain('"text-[9px] text-stone-400 ml-1"');
  });

  it("AnnotationToolbar (optional) hint uses text-stone-500 not text-stone-400", () => {
    expect(annotationTb).not.toContain('"text-stone-400">(optional)');
    expect(annotationTb).toContain('"text-stone-500">(optional)');
  });

  it("VocabWordTooltip Base form label uses text-stone-500 not text-stone-400 (2.65:1 fail)", () => {
    expect(vocabTooltip).not.toContain("text-[11px] text-stone-400");
    expect(vocabTooltip).toContain("text-[11px] text-stone-500");
  });

  it("VocabWordTooltip Close button uses text-stone-500 (WCAG 1.4.11 non-text 3:1)", () => {
    expect(vocabTooltip).not.toContain('"text-stone-400 hover:text-stone-600');
    expect(vocabTooltip).toContain("text-stone-500 hover:text-stone-700");
  });

  it("DeckCard delete icon uses text-stone-500 not text-stone-400 (WCAG 1.4.11)", () => {
    expect(deckCard).not.toContain("text-stone-400 hover:text-red-600");
    expect(deckCard).toContain("text-stone-500 hover:text-red-600");
  });

  it("ChapterSummary empty state uses text-stone-500 not text-stone-400", () => {
    expect(chapterSummary).not.toContain("text-center text-stone-400");
    expect(chapterSummary).toContain("text-center text-stone-500");
  });
});
