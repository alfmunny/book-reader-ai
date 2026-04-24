import * as fs from "fs";
import * as path from "path";

const src = fs.readFileSync(
  path.join(__dirname, "../components/QueueTab.tsx"),
  "utf8"
);

describe("QueueTab form controls aria-label (closes #961)", () => {
  it("dry-run language select has aria-label", () => {
    // value={dryRunLang} appears on the select element; aria-label is just before it
    const idx = src.indexOf('value={dryRunLang}');
    expect(idx).toBeGreaterThan(-1);
    const window = src.slice(Math.max(0, idx - 200), idx + 50);
    expect(window).toContain('aria-label="Preview language"');
  });

  it("custom model input has aria-label", () => {
    const idx = src.indexOf('placeholder="Custom model (e.g. gemini-exp-1206)"');
    expect(idx).toBeGreaterThan(-1);
    const window = src.slice(Math.max(0, idx - 200), idx + 50);
    expect(window).toContain('aria-label="Custom model name"');
  });
});
