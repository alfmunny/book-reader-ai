/**
 * Static-analysis tests for WCAG 3.1.2 lang attribute on AnnotationToolbar
 * quoted sentence text (issue #2283).
 */
import * as fs from "fs";
import * as path from "path";

const SRC = path.resolve(
  __dirname,
  "../components/AnnotationToolbar.tsx"
);

describe("AnnotationToolbar WCAG 3.1.2 lang attribute", () => {
  let src: string;

  beforeAll(() => {
    src = fs.readFileSync(SRC, "utf8");
  });

  it("Props interface includes bookLanguage optional string", () => {
    const anchor = src.indexOf("interface Props");
    expect(anchor).toBeGreaterThan(-1);
    const block = src.slice(anchor, anchor + 400);
    expect(block).toMatch(/bookLanguage\?\s*:\s*string/);
  });

  it("quoted sentence paragraph carries lang attribute", () => {
    const anchor = src.indexOf("sentenceText}");
    expect(anchor).toBeGreaterThan(-1);
    // Look for lang= in the 200 chars before the close of the paragraph
    const block = src.slice(Math.max(0, anchor - 200), anchor + 20);
    expect(block).toMatch(/lang=\{bookLanguage/);
  });

  it("bookLanguage is destructured from props", () => {
    const anchor = src.indexOf("export default function AnnotationToolbar");
    expect(anchor).toBeGreaterThan(-1);
    const block = src.slice(anchor, anchor + 300);
    expect(block).toMatch(/bookLanguage/);
  });
});
