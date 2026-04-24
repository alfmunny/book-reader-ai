import * as fs from "fs";
import * as path from "path";

const src = fs.readFileSync(
  path.join(__dirname, "../components/InsightChat.tsx"),
  "utf8"
);

describe("InsightChat language select aria-label (closes #1000)", () => {
  it("toolbar language select has aria-label attribute", () => {
    // Find the select in the toolbar (before the chat messages area)
    const idx = src.indexOf("<select");
    expect(idx).toBeGreaterThan(-1);
    const window = src.slice(idx, idx + 300);
    expect(window).toContain('aria-label=');
  });

  it("toolbar language select aria-label describes the insight language", () => {
    const idx = src.indexOf("<select");
    expect(idx).toBeGreaterThan(-1);
    const window = src.slice(idx, idx + 300);
    expect(window).toMatch(/aria-label=["']Insight language["']/);
  });
});
