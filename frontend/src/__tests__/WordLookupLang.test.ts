/**
 * Static source analysis: WordLookup renders word and result.word with lang attribute
 * for WCAG 3.1.2 Language of Parts (closes #2279)
 */
import * as fs from "fs";
import * as path from "path";

const src = fs.readFileSync(
  path.join(__dirname, "../components/WordLookup.tsx"),
  "utf8"
);

describe("WordLookup WCAG 3.1.2 lang (issue #2279)", () => {
  it("lang is computed at component scope (not only inside useEffect)", () => {
    // Find first useEffect( call (not the import)
    const useEffectCallIdx = src.indexOf("useEffect(");
    const componentBody = src.slice(0, useEffectCallIdx > 0 ? useEffectCallIdx : src.length);
    // lang must be computed somewhere before the first useEffect call
    expect(componentBody).toMatch(/const lang\s*=/);
  });

  it("loading state renders word with lang attribute", () => {
    const anchor = src.indexOf("Looking up");
    expect(anchor).toBeGreaterThan(-1);
    const block = src.slice(anchor, anchor + 120);
    expect(block).toMatch(/lang=\{lang\}/);
  });

  it("error state renders word with lang attribute", () => {
    const anchor = src.indexOf('role="alert"');
    expect(anchor).toBeGreaterThan(-1);
    const block = src.slice(anchor, anchor + 150);
    expect(block).toMatch(/lang=\{lang\}/);
  });

  it("result heading renders result.word with lang attribute", () => {
    const anchor = src.indexOf("result.word");
    expect(anchor).toBeGreaterThan(-1);
    const before = src.slice(Math.max(0, anchor - 80), anchor);
    expect(before).toMatch(/lang=\{lang\}/);
  });
});
