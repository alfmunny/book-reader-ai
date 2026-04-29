/**
 * Static-analysis tests: <summary> elements used as keyboard-focusable
 * disclosures must carry the design-system focus-visible ring classes.
 */
import * as fs from "fs";
import * as path from "path";

const src = (rel: string) =>
  fs.readFileSync(
    path.resolve(__dirname, "../components", rel),
    "utf-8"
  );

describe("summary element focus rings", () => {
  it("QueueTab activity-log summary has focus-visible:ring", () => {
    const content = src("QueueTab.tsx");
    const idx = content.indexOf("Activity log");
    expect(idx).toBeGreaterThan(-1);
    const window = content.slice(Math.max(0, idx - 300), idx + 50);
    expect(window).toContain("focus-visible:ring");
  });

  it("QueueTab activity-log summary has focus:outline-none", () => {
    const content = src("QueueTab.tsx");
    const idx = content.indexOf("Activity log");
    const window = content.slice(Math.max(0, idx - 300), idx + 50);
    expect(window).toContain("focus:outline-none");
  });

  it("SeedPopularButton recent-events summary has focus-visible:ring", () => {
    const content = src("SeedPopularButton.tsx");
    const idx = content.indexOf("Recent events");
    expect(idx).toBeGreaterThan(-1);
    const window = content.slice(Math.max(0, idx - 300), idx + 50);
    expect(window).toContain("focus-visible:ring");
  });

  it("SeedPopularButton recent-events summary has focus:outline-none", () => {
    const content = src("SeedPopularButton.tsx");
    const idx = content.indexOf("Recent events");
    const window = content.slice(Math.max(0, idx - 300), idx + 50);
    expect(window).toContain("focus:outline-none");
  });
});
