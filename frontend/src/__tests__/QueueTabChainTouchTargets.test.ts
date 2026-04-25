import * as fs from "fs";
import * as path from "path";

const src = fs.readFileSync(
  path.join(__dirname, "../components/QueueTab.tsx"),
  "utf8"
);

function checkAround(anchor: string, radius = 300): void {
  const idx = src.indexOf(anchor);
  expect(idx).toBeGreaterThan(-1);
  const window = src.slice(Math.max(0, idx - radius), idx + radius);
  expect(window).toContain("min-h-[44px]");
}

describe("QueueTab model-chain button touch targets (closes #850)", () => {
  it("Save chain button has min-h-[44px]", () => {
    checkAround('"Saving…" : "Save chain"', 550);
  });

  it("preset card buttons have min-h-[44px]", () => {
    checkAround("setChain([...p.chain])");
  });

  it("Move up button has min-h-[44px]", () => {
    checkAround("} up`}");
  });

  it("Move down button has min-h-[44px]", () => {
    checkAround("} down`}");
  });

  it("Remove from chain button has min-h-[44px]", () => {
    checkAround("from chain`}");
  });
});
