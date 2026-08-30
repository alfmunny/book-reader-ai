import { readFileSync } from "fs";
import { join } from "path";

const src = readFileSync(
  join(__dirname, "../app/(shell)/notes/[bookId]/page.tsx"),
  "utf-8"
);

describe("notes/[bookId]/page.tsx list semantics (WCAG 1.3.1)", () => {
  it("renderAnnotation returns <li> wrapper", () => {
    const fnMatch = src.match(/function renderAnnotation[\s\S]*?^  \}/m);
    expect(fnMatch).not.toBeNull();
    expect(fnMatch![0]).toContain("<li key={ann.id}>");
  });

  it("renderInsight returns <li> wrapper", () => {
    const fnMatch = src.match(/function renderInsight[\s\S]*?^  \}/m);
    expect(fnMatch).not.toBeNull();
    expect(fnMatch![0]).toContain("<li key={ins.id}>");
  });

  it("all renderAnnotation call sites are inside <ul role=\"list\">", () => {
    const ulMatches = src.match(/<ul role="list"[^>]*>\s*\{[^}]*\.map\(renderAnnotation\)/g);
    expect(ulMatches).not.toBeNull();
    // 3 usages: byChapterAnn (section view), chAnns (chapter view)
    // some may be combined; at minimum 2 <ul> wrappers
    expect(ulMatches!.length).toBeGreaterThanOrEqual(2);
  });

  it("all renderInsight call sites are inside <ul role=\"list\">", () => {
    const ulMatches = src.match(/<ul role="list"[^>]*>\s*\{[^}]*\.map\(renderInsight\)/g);
    expect(ulMatches).not.toBeNull();
    // 4 usages across section and chapter views
    expect(ulMatches!.length).toBeGreaterThanOrEqual(3);
  });

  it("no <ul> is missing role=list around annotation or insight maps", () => {
    // Every .map(renderAnnotation) and .map(renderInsight) must appear inside a <ul role="list"> block
    const annUlWraps = (src.match(/<ul role="list"[\s\S]*?\.map\(renderAnnotation\)/g) || []).length;
    const annTotalMaps = (src.match(/\.map\(renderAnnotation\)/g) || []).length;
    expect(annUlWraps).toBe(annTotalMaps);

    const insUlWraps = (src.match(/<ul role="list"[\s\S]*?\.map\(renderInsight\)/g) || []).length;
    const insTotalMaps = (src.match(/\.map\(renderInsight\)/g) || []).length;
    expect(insUlWraps).toBe(insTotalMaps);
  });
});
