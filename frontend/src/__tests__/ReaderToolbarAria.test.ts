import * as fs from "fs";
import * as path from "path";

const src = fs.readFileSync(
  path.join(__dirname, "../app/reader/[bookId]/page.tsx"),
  "utf8"
);

describe("Reader toolbar sidebar-toggle buttons aria-label (closes #1022)", () => {
  it("Insight chat toggle has aria-label 'Insight sidebar'", () => {
    const idx = src.indexOf('title="Toggle insight chat"');
    expect(idx).toBeGreaterThan(-1);
    const window = src.slice(idx, idx + 200);
    expect(window).toContain('aria-label="Insight sidebar"');
  });

  it("Translate toggle has aria-label 'Translate'", () => {
    const idx = src.indexOf('title="Translation"');
    expect(idx).toBeGreaterThan(-1);
    const window = src.slice(idx, idx + 200);
    expect(window).toContain('aria-label="Translate"');
  });

  it("Chapter summary toggle has aria-label", () => {
    const idx = src.indexOf('title="Chapter summary"');
    expect(idx).toBeGreaterThan(-1);
    const window = src.slice(idx, idx + 200);
    expect(window).toContain("aria-label");
  });

  it("Notes sidebar toggle has aria-label", () => {
    const idx = src.indexOf('title="Annotations & notes"');
    expect(idx).toBeGreaterThan(-1);
    const window = src.slice(idx, idx + 200);
    expect(window).toContain("aria-label");
  });

  it("Vocabulary sidebar toggle has aria-label", () => {
    const idx = src.indexOf('title="Vocabulary"');
    expect(idx).toBeGreaterThan(-1);
    const window = src.slice(idx, idx + 200);
    expect(window).toContain("aria-label");
  });
});
