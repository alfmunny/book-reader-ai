import { readFileSync } from "fs";
import { join } from "path";

const src = readFileSync(
  join(__dirname, "../app/reader/[bookId]/page.tsx"),
  "utf-8"
);

describe("reader/[bookId]/page.tsx sidebar list semantics (WCAG 1.3.1)", () => {
  it("renderCard returns <li> wrapper", () => {
    const fnMatch = src.match(/const renderCard = \(ann[\s\S]*?^                \);/m);
    expect(fnMatch).not.toBeNull();
    expect(fnMatch![0]).toContain("<li key={ann.id}>");
    expect(fnMatch![0]).toContain("</li>");
  });

  it("filteredNotes.map(renderCard) is wrapped in <ul role=\"list\">", () => {
    expect(src).toMatch(/<ul role="list"[^>]*>\s*\{filteredNotes\.map\(renderCard\)\}/);
  });

  it("annotations.filter(...).map(renderCard) is wrapped in <ul role=\"list\">", () => {
    // Find all <ul role="list"> blocks that contain map(renderCard) — multiline
    const ulBlocks = src.match(/<ul[^>]+role="list"[\s\S]*?<\/ul>/g) || [];
    const containsFilterMap = ulBlocks.some(
      (block) => block.includes(".filter(") && block.includes(".map(renderCard)")
    );
    expect(containsFilterMap).toBe(true);
  });

  it("filteredVocab.map is inside <ul role=\"list\">", () => {
    expect(src).toMatch(/<ul role="list"[^>]*aria-label="Vocabulary"[^>]*>/);
    const vocabMatch = src.match(/<ul role="list"[^>]*aria-label="Vocabulary"[^>]*>[\s\S]*?filteredVocab\.map/);
    expect(vocabMatch).not.toBeNull();
  });

  it("vocab items wrapped in <li key={w.id}>", () => {
    expect(src).toMatch(/<li key=\{w\.id\}>/);
  });

  it("bottom notes expand panel uses <ul role=\"list\"> around annotation buttons", () => {
    // The annotations.map in the bottom panel should be in a <ul role="list">
    const bottomMatch = src.match(/<ul role="list"[^>]*aria-label="Annotations"[^>]*>[\s\S]*?<li key=\{ann\.id\}>\s*<button[\s\S]*?setNotesExpanded\(false\)/);
    expect(bottomMatch).not.toBeNull();
  });
});
