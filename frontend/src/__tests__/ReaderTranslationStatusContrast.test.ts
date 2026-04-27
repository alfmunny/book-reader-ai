import * as fs from "fs";
import * as path from "path";

// Reader translation-status pulse used text-xs text-amber-600 on white
// (≈3.62:1) — failed WCAG 1.4.3 AA. Closes #1669.

const src = fs.readFileSync(
  path.join(__dirname, "../app/reader/[bookId]/page.tsx"),
  "utf8",
);

describe("reader translation status contrast (closes #1669)", () => {
  it("the 'Checking for translation…' span does not use text-amber-600", () => {
    const marker = "Checking for translation…";
    const markerIdx = src.indexOf(marker);
    expect(markerIdx).toBeGreaterThan(-1);
    // Walk back to the nearest <span and forward to the closing >.
    const spanStart = src.lastIndexOf("<span", markerIdx);
    expect(spanStart).toBeGreaterThan(-1);
    const tagEnd = src.indexOf(">", spanStart);
    expect(tagEnd).toBeGreaterThan(spanStart);
    const tag = src.slice(spanStart, tagEnd + 1);
    expect(tag).not.toMatch(/text-amber-600/);
  });
});
