import * as fs from "fs";
import * as path from "path";

const src = fs.readFileSync(
  path.join(__dirname, "../components/QueueTab.tsx"),
  "utf8"
);

describe("QueueTab item filter pills aria-pressed (closes #1299)", () => {
  it("filter button has aria-pressed={itemFilter === f}", () => {
    expect(src).toContain("aria-pressed={itemFilter === f}");
  });
});
