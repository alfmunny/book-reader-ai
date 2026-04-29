/**
 * Static-analysis tests: dark mode must override text-stone-600/700/500 so
 * secondary text passes WCAG AA contrast on dark card backgrounds.
 */
import * as fs from "fs";
import * as path from "path";

const globalsCss = fs.readFileSync(
  path.resolve(__dirname, "../app/globals.css"),
  "utf-8"
);

describe("Dark mode stone text contrast overrides", () => {
  it('overrides text-stone-600 in dark mode', () => {
    expect(globalsCss).toContain('[data-theme="dark"] .text-stone-600');
  });

  it('overrides text-stone-700 in dark mode', () => {
    expect(globalsCss).toContain('[data-theme="dark"] .text-stone-700');
  });

  it('overrides text-stone-500 in dark mode', () => {
    expect(globalsCss).toContain('[data-theme="dark"] .text-stone-500');
  });

  it('stone-600 dark override is a light color (not original dark value)', () => {
    const idx = globalsCss.indexOf('[data-theme="dark"] .text-stone-600');
    const window = globalsCss.slice(idx, idx + 80);
    // Must not be the original stone-600 (#57534e) — must be lighter
    expect(window).not.toContain('#57534e');
    expect(window).toContain('color:');
  });
});
