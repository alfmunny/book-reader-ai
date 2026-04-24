import * as fs from "fs";
import * as path from "path";

const src = fs.readFileSync(
  path.join(__dirname, "../components/SeedPopularButton.tsx"),
  "utf8"
);

describe("SeedPopularButton touch targets (closes #865)", () => {
  it("Seed all popular books button has min-h-[44px]", () => {
    // className follows onClick={start} — forward window
    const idx = src.indexOf("onClick={start}");
    expect(idx).toBeGreaterThan(-1);
    const window = src.slice(idx, idx + 200);
    expect(window).toContain("min-h-[44px]");
  });

  it("Show progress button has min-h-[44px]", () => {
    // second setExpanded(true) is the button onclick; className follows it
    const first = src.indexOf("setExpanded(true)");
    const idx = src.indexOf("setExpanded(true)", first + 1);
    expect(idx).toBeGreaterThan(-1);
    const window = src.slice(idx, idx + 200);
    expect(window).toContain("min-h-[44px]");
  });

  it("Hide button has min-h-[44px]", () => {
    // className follows onClick={() => setExpanded(false)} — forward window
    const idx = src.indexOf("setExpanded(false)");
    expect(idx).toBeGreaterThan(-1);
    const window = src.slice(idx, idx + 200);
    expect(window).toContain("min-h-[44px]");
  });

  it("Stop button has min-h-[44px]", () => {
    // className follows onClick={stop} — forward window
    const idx = src.indexOf("onClick={stop}");
    expect(idx).toBeGreaterThan(-1);
    const window = src.slice(idx, idx + 200);
    expect(window).toContain("min-h-[44px]");
  });
});
