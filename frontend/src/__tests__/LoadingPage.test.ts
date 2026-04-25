/**
 * Static assertion: app/loading.tsx renders themed loading state.
 * Closes #1171
 */
import fs from "fs";
import path from "path";

const loadingPath = path.join(process.cwd(), "src/app/loading.tsx");

describe("Custom loading page", () => {
  it("file exists at app/loading.tsx", () => {
    expect(fs.existsSync(loadingPath)).toBe(true);
  });

  it("uses bg-parchment for theme consistency", () => {
    const src = fs.readFileSync(loadingPath, "utf8");
    expect(src).toContain("bg-parchment");
  });

  it("has role=status with aria-label", () => {
    const src = fs.readFileSync(loadingPath, "utf8");
    expect(src).toContain('role="status"');
    expect(src).toMatch(/aria-label="Loading page"/);
  });

  it("uses an aria-hidden spinner (decorative)", () => {
    const src = fs.readFileSync(loadingPath, "utf8");
    expect(src).toContain('aria-hidden="true"');
  });
});
