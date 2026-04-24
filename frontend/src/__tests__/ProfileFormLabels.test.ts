import * as fs from "fs";
import * as path from "path";

const src = fs.readFileSync(
  path.join(__dirname, "../app/profile/page.tsx"),
  "utf8"
);

describe("profile page form control label associations (closes #956)", () => {
  it("Gemini API key input has aria-label", () => {
    const idx = src.indexOf('placeholder="AIza…"');
    expect(idx).toBeGreaterThan(-1);
    const window = src.slice(Math.max(0, idx - 200), idx + 50);
    expect(window).toContain('aria-label="Gemini API key"');
  });

  it("GitHub Token input is associated via id/htmlFor", () => {
    const idx = src.indexOf("obsidian-token");
    expect(idx).toBeGreaterThan(-1);
    // Both id and htmlFor should reference the same value
    expect(src).toContain('id="obsidian-token"');
    expect(src).toContain('htmlFor="obsidian-token"');
  });

  it("Obsidian Repo input is associated via id/htmlFor", () => {
    expect(src).toContain('id="obsidian-repo"');
    expect(src).toContain('htmlFor="obsidian-repo"');
  });

  it("Vault Path input is associated via id/htmlFor", () => {
    expect(src).toContain('id="obsidian-path"');
    expect(src).toContain('htmlFor="obsidian-path"');
  });

  it("Insight language select is associated via id/htmlFor", () => {
    expect(src).toContain('id="pref-insight-lang"');
    expect(src).toContain('htmlFor="pref-insight-lang"');
  });

  it("Translation language select is associated via id/htmlFor", () => {
    expect(src).toContain('id="pref-translation-lang"');
    expect(src).toContain('htmlFor="pref-translation-lang"');
  });
});
