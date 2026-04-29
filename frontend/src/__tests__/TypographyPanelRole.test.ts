import * as fs from "fs";
import * as path from "path";

const src = fs.readFileSync(
  path.join(__dirname, "../components/TypographyPanel.tsx"),
  "utf8"
);

describe("TypographyPanel ARIA role (closes #2077)", () => {
  it('panel container has role="group"', () => {
    expect(src).toContain('role="group"');
  });

  it('panel container has aria-label="Typography settings"', () => {
    expect(src).toContain('aria-label="Typography settings"');
  });

  it("role and aria-label appear on the panel container element", () => {
    const idx = src.indexOf('id="typography-panel"');
    expect(idx).toBeGreaterThan(-1);
    const window = src.slice(Math.max(0, idx - 150), idx + 100);
    expect(window).toContain('role="group"');
    expect(window).toContain('aria-label="Typography settings"');
  });
});
