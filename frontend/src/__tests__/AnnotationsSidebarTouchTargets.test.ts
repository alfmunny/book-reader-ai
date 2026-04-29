import * as fs from "fs";
import * as path from "path";

const src = fs.readFileSync(
  path.join(__dirname, "../components/AnnotationsSidebar.tsx"),
  "utf8"
);

describe("AnnotationsSidebar touch targets (closes #806)", () => {
  it("Close button has min-h-[44px]", () => {
    const idx = src.indexOf('aria-label="Close annotations sidebar"');
    expect(idx).toBeGreaterThan(-1);
    const window = src.slice(Math.max(0, idx - 300), idx + 100);
    expect(window).toContain("min-h-[44px]");
  });

  it("Close button has min-w-[44px]", () => {
    const idx = src.indexOf('aria-label="Close annotations sidebar"');
    expect(idx).toBeGreaterThan(-1);
    const window = src.slice(Math.max(0, idx - 300), idx + 100);
    expect(window).toContain("min-w-[44px]");
  });

  it("Edit annotation button has min-h-[44px]", () => {
    const idx = src.indexOf("aria-label={`Edit annotation: ${ann.sentence_text.slice");
    expect(idx).toBeGreaterThan(-1);
    const window = src.slice(Math.max(0, idx - 300), idx + 100);
    expect(window).toContain("min-h-[44px]");
  });

  it("Edit annotation button has min-w-[44px]", () => {
    const idx = src.indexOf("aria-label={`Edit annotation: ${ann.sentence_text.slice");
    expect(idx).toBeGreaterThan(-1);
    const window = src.slice(Math.max(0, idx - 300), idx + 100);
    expect(window).toContain("min-w-[44px]");
  });
});

describe("AnnotationsSidebar interactive anchors meet 44px mobile touch target (closes #1547)", () => {
  it("every <a href=...> opening tag carries min-h-[44px]", () => {
    // Match <a ...> opening tag, allowing => (arrow fn) inside JSX attrs.
    const anchorRe = /<a\b((?:=>|[^>])*?)>/g;
    let m: RegExpExecArray | null;
    const offenders: string[] = [];
    while ((m = anchorRe.exec(src)) !== null) {
      const attrs = m[1];
      if (!attrs.includes("href")) continue;
      if (!attrs.includes("min-h-[44px]")) {
        offenders.push(m[0]);
      }
    }
    expect(offenders).toEqual([]);
  });
});
