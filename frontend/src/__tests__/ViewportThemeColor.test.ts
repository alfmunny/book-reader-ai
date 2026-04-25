/**
 * Static assertion: app/layout.tsx Viewport sets themeColor matching manifest.
 * Closes #1177
 */
import fs from "fs";
import path from "path";

const layout = fs.readFileSync(
  path.join(process.cwd(), "src/app/layout.tsx"),
  "utf8",
);
const manifest = JSON.parse(
  fs.readFileSync(path.join(process.cwd(), "public/manifest.json"), "utf8"),
);

describe("Viewport themeColor", () => {
  it("Viewport export includes themeColor", () => {
    expect(layout).toMatch(/themeColor:/);
  });

  it("themeColor matches manifest theme_color", () => {
    // Pull the value from the layout TS source
    const match = layout.match(/themeColor:\s*"([^"]+)"/);
    expect(match).not.toBeNull();
    expect(match![1]).toBe(manifest.theme_color);
  });
});
