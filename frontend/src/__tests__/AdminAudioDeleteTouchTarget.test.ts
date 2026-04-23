/**
 * Verifies the admin audio Delete button meets 44px touch-target requirement.
 */
import fs from "fs";
import path from "path";

const src = fs.readFileSync(
  path.join(__dirname, "../app/admin/audio/page.tsx"),
  "utf-8"
);

describe("Admin audio Delete button touch target", () => {
  it("Delete button has min-h-[44px]", () => {
    expect(src).toMatch(/DELETE[\s\S]{0,200}min-h-\[44px\]/);
  });
});
