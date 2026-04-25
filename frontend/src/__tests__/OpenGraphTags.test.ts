/**
 * Static assertions: app/layout.tsx exports OpenGraph + Twitter card metadata.
 * Closes #1175
 */
import fs from "fs";
import path from "path";

const layout = fs.readFileSync(
  path.join(process.cwd(), "src/app/layout.tsx"),
  "utf8",
);

describe("OpenGraph + Twitter metadata", () => {
  it("metadata includes openGraph block", () => {
    expect(layout).toMatch(/openGraph:\s*\{/);
  });

  it("openGraph references the icon image", () => {
    const idx = layout.indexOf("openGraph");
    expect(idx).toBeGreaterThan(0);
    const block = layout.slice(idx, idx + 500);
    expect(block).toContain("/icon.svg");
  });

  it("metadata includes twitter card block", () => {
    expect(layout).toMatch(/twitter:\s*\{/);
  });

  it("twitter card uses summary", () => {
    const idx = layout.indexOf("twitter:");
    expect(idx).toBeGreaterThan(0);
    const block = layout.slice(idx, idx + 500);
    expect(block).toMatch(/card:\s*"summary"/);
  });
});
