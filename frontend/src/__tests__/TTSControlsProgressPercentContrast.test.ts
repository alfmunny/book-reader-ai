import * as fs from "fs";
import * as path from "path";

// TTSControls chunk-progress percentage label used text-amber-600 at
// text-xs on white (≈3.62:1) — failed WCAG 1.4.3 AA. Closes #1653.

const src = fs.readFileSync(
  path.join(__dirname, "../components/TTSControls.tsx"),
  "utf8",
);

describe("TTSControls progress percentage contrast (closes #1653)", () => {
  it("the percentage span does not use text-amber-600", () => {
    // Locate the loading-state row by anchor text and assert no
    // text-amber-600 appears in the immediate window around it.
    const idx = src.indexOf("Generating chunk");
    expect(idx).toBeGreaterThan(-1);
    const window = src.slice(idx, idx + 400);
    expect(window).not.toMatch(/text-amber-600/);
  });
});
