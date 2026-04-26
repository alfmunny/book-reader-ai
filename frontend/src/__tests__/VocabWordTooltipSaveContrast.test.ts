import * as fs from "fs";
import * as path from "path";

// White on amber-600 measures ≈3.62:1 — fails WCAG 1.4.3 AA at text-xs.
// Closes #1557.

const src = fs.readFileSync(
  path.join(__dirname, "../components/VocabWordTooltip.tsx"),
  "utf8",
);

describe("VocabWordTooltip Save button contrast (closes #1557)", () => {
  it("Save button does not use bg-amber-600 text-white", () => {
    expect(src).not.toMatch(/bg-amber-600\s+text-white/);
  });
});
