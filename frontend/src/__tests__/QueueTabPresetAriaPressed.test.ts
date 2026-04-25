import * as fs from "fs";
import * as path from "path";

const src = fs.readFileSync(
  path.join(__dirname, "../components/QueueTab.tsx"),
  "utf8"
);

describe("QueueTab chain preset buttons aria-pressed (closes #1292)", () => {
  it("preset button has aria-pressed={active}", () => {
    expect(src).toContain("aria-pressed={active}");
  });
});
