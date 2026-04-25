import * as fs from "fs";
import * as path from "path";

function read(rel: string) {
  return fs.readFileSync(path.join(__dirname, rel), "utf8");
}

describe("role=alert on dynamic error containers (closes #1256)", () => {
  it("homepage searchError div has role=alert", () => {
    const src = read("../app/page.tsx");
    const idx = src.indexOf("searchError &&");
    expect(idx).toBeGreaterThan(-1);
    const window = src.slice(idx, idx + 150);
    expect(window).toMatch(/role="alert"/);
  });

  it("QueueTab last_error div has role=alert", () => {
    const src = read("../components/QueueTab.tsx");
    const idx = src.indexOf("Last error:");
    expect(idx).toBeGreaterThan(-1);
    const window = src.slice(Math.max(0, idx - 100), idx + 50);
    expect(window).toMatch(/role="alert"/);
  });

  it("QueueTab dryRunError div has role=alert", () => {
    const src = read("../components/QueueTab.tsx");
    const idx = src.indexOf("dryRunError &&");
    expect(idx).toBeGreaterThan(-1);
    const window = src.slice(idx, idx + 150);
    expect(window).toMatch(/role="alert"/);
  });
});
