import * as fs from "fs";
import * as path from "path";

// text-amber-500 on amber-50 measures ≈2.6:1 — fails WCAG 1.4.3 AA at
// text-xs. Closes #1564.

const src = fs.readFileSync(
  path.join(__dirname, "../components/InsightChat.tsx"),
  "utf8",
);

describe("ContextChip more/less toggle contrast (closes #1564)", () => {
  it("Toggle context button does not use text-amber-500", () => {
    const idx = src.indexOf('aria-label="Toggle context"');
    expect(idx).toBeGreaterThan(-1);
    const window = src.slice(Math.max(0, idx - 300), idx + 50);
    expect(window).not.toMatch(/text-amber-500/);
  });
});
