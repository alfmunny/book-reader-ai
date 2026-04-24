import * as fs from "fs";
import * as path from "path";

const src = fs.readFileSync(
  path.join(__dirname, "../components/QueueTab.tsx"),
  "utf8"
);

describe("QueueTab service-settings inputs have accessible labels (closes #1030)", () => {
  it("auto-translate languages input has aria-label", () => {
    // The <label> at line ~781 has no htmlFor and does not wrap the <input>,
    // so the input needs its own aria-label for an accessible name.
    const idx = src.indexOf('placeholder="zh, de, ja"');
    expect(idx).toBeGreaterThan(-1);
    const window = src.slice(Math.max(0, idx - 300), idx + 100);
    expect(window).toMatch(/aria-label=/);
  });

  it("Gemini API key input has aria-label", () => {
    const idx = src.indexOf('"•••• (leave empty to keep)"');
    expect(idx).toBeGreaterThan(-1);
    const window = src.slice(Math.max(0, idx - 300), idx + 100);
    expect(window).toMatch(/aria-label=/);
  });
});
