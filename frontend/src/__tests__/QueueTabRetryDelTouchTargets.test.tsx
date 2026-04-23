/**
 * Verifies QueueTab Retry and Del buttons meet 44px touch target minimum.
 * Issue #653: py-0.5 gives ~16px height — well below the 44px requirement.
 */
import fs from "fs";
import path from "path";

const src = fs.readFileSync(
  path.join(__dirname, "../../src/components/QueueTab.tsx"),
  "utf-8"
);

// Extract all button className strings that contain "Retry" or "Del" labels.
// We check the raw source rather than rendering because QueueTab has heavy deps.
const retryBtnMatch = src.match(/onClick=\{[^}]*retry[^}]*\}[^>]*className="([^"]+)"/s);
const delBtnMatch = src.match(/onClick=\{[^}]*remove[^}]*\}[^>]*className="([^"]+)"/s);

describe("QueueTab Retry/Del buttons — 44px touch target (issue #653)", () => {
  it("Retry button has min-h-[44px]", () => {
    expect(retryBtnMatch).not.toBeNull();
    expect(retryBtnMatch![1]).toContain("min-h-[44px]");
  });

  it("Del button has min-h-[44px]", () => {
    expect(delBtnMatch).not.toBeNull();
    expect(delBtnMatch![1]).toContain("min-h-[44px]");
  });
});
