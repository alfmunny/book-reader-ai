import * as fs from "fs";
import * as path from "path";

const src = fs.readFileSync(
  path.resolve(__dirname, "../components/QueueTab.tsx"),
  "utf8"
);

describe("QueueTab plan-preview table headers have scope=col (closes #1264)", () => {
  it("Book column header has scope=col", () => {
    const idx = src.indexOf(">Book</th>");
    expect(idx).toBeGreaterThan(-1);
    const region = src.slice(Math.max(0, idx - 100), idx + 20);
    expect(region).toContain('scope="col"');
  });

  it("Chapters column header has scope=col", () => {
    const idx = src.indexOf(">Chapters</th>");
    expect(idx).toBeGreaterThan(-1);
    const region = src.slice(Math.max(0, idx - 100), idx + 20);
    expect(region).toContain('scope="col"');
  });
});
