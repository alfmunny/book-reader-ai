import * as fs from "fs";
import * as path from "path";

const src = fs.readFileSync(
  path.join(__dirname, "../components/SentenceReader.tsx"),
  "utf8"
);

describe("SentenceReader note-dot button touch target (closes #976)", () => {
  it("note-dot toggle button has min-h-[44px] touch target class", () => {
    // Find the note-dot button by its aria-label
    const idx = src.indexOf('aria-label="Toggle note"');
    expect(idx).toBeGreaterThan(-1);
    // Look at the button element up to 300 chars before aria-label (className is set on the button tag)
    const window = src.slice(Math.max(0, idx - 300), idx + 50);
    expect(window).toContain("min-h-[44px]");
  });

  it("note-dot toggle button has min-w-[44px] touch target class", () => {
    const idx = src.indexOf('aria-label="Toggle note"');
    expect(idx).toBeGreaterThan(-1);
    const window = src.slice(Math.max(0, idx - 300), idx + 50);
    expect(window).toContain("min-w-[44px]");
  });
});
