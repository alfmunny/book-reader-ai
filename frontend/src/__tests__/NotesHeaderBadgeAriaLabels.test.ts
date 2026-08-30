/**
 * Regression test for #1901: notes header stat badges must have accessible labels
 * so screen readers announce counts with context (WCAG 1.3.1).
 */
import * as fs from "fs";
import * as path from "path";

const src = fs.readFileSync(
  path.join(__dirname, "../app/(shell)/notes/page.tsx"),
  "utf8",
);

describe("Notes header stat badges — accessible labels (closes #1901)", () => {
  it("annotation count badge has aria-label mentioning 'annotation'", () => {
    expect(src).toMatch(/aria-label=\{`\$\{totalAnn\}[^`]*annotation/);
  });

  it("insight count badge has aria-label mentioning 'insight'", () => {
    expect(src).toMatch(/aria-label=\{`\$\{totalIns\}[^`]*insight/i);
  });

  it("vocabulary count badge has aria-label mentioning 'vocab'", () => {
    expect(src).toMatch(/aria-label=\{`\$\{totalVoc\}[^`]*vocab/i);
  });
});
