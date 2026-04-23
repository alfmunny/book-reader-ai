/**
 * Verifies QueueTab Stop/Start Worker buttons meet 44px touch target minimum.
 * Issue #655: py-1 gives ~24px height — below the 44px requirement.
 */
import fs from "fs";
import path from "path";

const src = fs.readFileSync(
  path.join(__dirname, "../../src/components/QueueTab.tsx"),
  "utf-8"
);

describe("QueueTab Stop/Start Worker buttons — 44px touch target (issue #655)", () => {
  it("Stop Worker button has min-h-[44px]", () => {
    expect(src).toMatch(/stopWorker[\s\S]{0,300}min-h-\[44px\]/);
  });

  it("Start Worker button has min-h-[44px]", () => {
    expect(src).toMatch(/startWorker[\s\S]{0,300}min-h-\[44px\]/);
  });
});
