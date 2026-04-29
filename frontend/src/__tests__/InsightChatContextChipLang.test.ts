/**
 * Static-analysis tests for WCAG 3.1.2 lang attribute on InsightChat
 * ContextChip quoted book text (issue #2287).
 */
import * as fs from "fs";
import * as path from "path";

const SRC = path.resolve(__dirname, "../components/InsightChat.tsx");

describe("InsightChat ContextChip WCAG 3.1.2 lang attribute", () => {
  let src: string;

  beforeAll(() => {
    src = fs.readFileSync(SRC, "utf8");
  });

  it("ContextChip props include bookLanguage optional string", () => {
    const anchor = src.indexOf("function ContextChip(");
    expect(anchor).toBeGreaterThan(-1);
    const block = src.slice(anchor, anchor + 300);
    expect(block).toMatch(/bookLanguage\?\s*:\s*string/);
  });

  it("ContextChip quoted span carries lang attribute", () => {
    const anchor = src.indexOf("italic leading-relaxed");
    expect(anchor).toBeGreaterThan(-1);
    // Look for lang= within 100 chars before the class (backward window)
    const before = src.slice(Math.max(0, anchor - 100), anchor);
    expect(before).toMatch(/lang=\{bookLanguage/);
  });

  it("ContextChip call site passes bookLanguage prop", () => {
    const anchor = src.indexOf("<ContextChip");
    expect(anchor).toBeGreaterThan(-1);
    const block = src.slice(anchor, anchor + 200);
    expect(block).toMatch(/bookLanguage=/);
  });

  it("MsgContextBlock props include bookLanguage optional string", () => {
    const anchor = src.indexOf("function MsgContextBlock(");
    expect(anchor).toBeGreaterThan(-1);
    const block = src.slice(anchor, anchor + 300);
    expect(block).toMatch(/bookLanguage\?\s*:\s*string/);
  });

  it("MsgContextBlock quoted paragraph carries lang attribute", () => {
    const anchor = src.indexOf("function MsgContextBlock(");
    expect(anchor).toBeGreaterThan(-1);
    // Find the paragraph within MsgContextBlock (body is ~600 chars to the <p>)
    const body = src.slice(anchor, anchor + 700);
    expect(body).toMatch(/lang=\{bookLanguage/);
  });
});
