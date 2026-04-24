import * as fs from "fs";
import * as path from "path";

const src = fs.readFileSync(
  path.join(__dirname, "../components/TTSControls.tsx"),
  "utf8"
);

describe("TTSControls gender toggle aria-label (closes #1018)", () => {
  it("gender toggle button has aria-label attribute", () => {
    const idx = src.indexOf("onClick={toggleGender}");
    expect(idx).toBeGreaterThan(-1);
    const window = src.slice(idx, idx + 400);
    expect(window).toContain("aria-label");
  });

  it("gender toggle button aria-label references the gender/voice", () => {
    const idx = src.indexOf("onClick={toggleGender}");
    expect(idx).toBeGreaterThan(-1);
    const window = src.slice(idx, idx + 400);
    expect(window).toMatch(/aria-label=.*[Vv]oice/);
  });
});
