import * as fs from "fs";
import * as path from "path";

const src = fs.readFileSync(
  path.join(__dirname, "../components/TypographyPanel.tsx"),
  "utf8"
);

describe("TypographyPanel paragraph-focus toggle touch target (closes #812)", () => {
  it("toggle button has min-h-[44px]", () => {
    const idx = src.indexOf('aria-label="Paragraph focus"');
    expect(idx).toBeGreaterThan(-1);
    const window = src.slice(Math.max(0, idx - 300), idx + 100);
    expect(window).toContain("min-h-[44px]");
  });

  it("toggle button has min-w-[44px]", () => {
    const idx = src.indexOf('aria-label="Paragraph focus"');
    expect(idx).toBeGreaterThan(-1);
    const window = src.slice(Math.max(0, idx - 300), idx + 100);
    expect(window).toContain("min-w-[44px]");
  });

  it("visual toggle track is an inner span, not on the button itself", () => {
    const idx = src.indexOf('aria-label="Paragraph focus"');
    expect(idx).toBeGreaterThan(-1);
    // The button element should NOT have h-5 or w-9 (those are on the inner span track)
    const btnWindow = src.slice(Math.max(0, idx - 300), idx + 50);
    expect(btnWindow).not.toContain("h-5");
    expect(btnWindow).not.toContain("w-9");
  });

  it("visual toggle track span has h-5 w-9", () => {
    const idx = src.indexOf('aria-label="Paragraph focus"');
    expect(idx).toBeGreaterThan(-1);
    // After the button opening, there should be a span with h-5 w-9
    const after = src.slice(idx, idx + 400);
    expect(after).toContain("h-5");
    expect(after).toContain("w-9");
  });
});
