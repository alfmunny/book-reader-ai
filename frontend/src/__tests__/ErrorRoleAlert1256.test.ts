import * as fs from "fs";
import * as path from "path";

function read(rel: string) {
  return fs.readFileSync(path.join(__dirname, rel), "utf8");
}

describe("role=alert on dynamic error containers (closes #1256)", () => {
  it("home catalog fetch error div has role=alert", () => {
    const src = read("../app/(shell)/page.tsx");
    const idx = src.indexOf("fetchError &&");
    expect(idx).toBeGreaterThan(-1);
    const window = src.slice(idx, idx + 200);
    expect(window).toMatch(/role="alert"/);
  });

  it("QueueTab last_error div has role=alert", () => {
    const src = read("../components/QueueTab.tsx");
    const idx = src.indexOf("Last error:");
    expect(idx).toBeGreaterThan(-1);
    // look back 150 chars: title= attribute before closing > can extend the line
    const window = src.slice(Math.max(0, idx - 150), idx + 50);
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
