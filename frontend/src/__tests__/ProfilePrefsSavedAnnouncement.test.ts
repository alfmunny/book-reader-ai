/**
 * Regression test for #1869 — profile page "Save preferences" button changed
 * its label to "Saved!" but had no aria-live region. Screen readers don't
 * reliably announce dynamic button label changes, so a separate role="status"
 * live region is needed next to the button.
 */
import { readFileSync } from "fs";
import { join } from "path";

const src = readFileSync(
  join(process.cwd(), "src/app/(shell)/profile/page.tsx"),
  "utf-8"
);

describe("Profile page preferences save feedback (WCAG 4.1.3)", () => {
  it("has an aria-live region near the Save preferences button", () => {
    // Find the save button area (uses prefsSaved in its className)
    const idx = src.lastIndexOf("prefsSaved");
    expect(idx).toBeGreaterThan(-1);
    // Within a reasonable window around the last prefsSaved reference (near button), there
    // must be an aria-live or role="status" live region for the save confirmation
    const window = src.slice(Math.max(0, idx - 600), idx + 400);
    const hasLiveRegion =
      window.includes('aria-live') ||
      window.includes('role="status"');
    expect(hasLiveRegion).toBe(true);
  });

  it("live region content references prefsSaved", () => {
    // The status div must conditionally render based on prefsSaved
    const statusPattern = /role="status"[\s\S]{0,200}prefsSaved|prefsSaved[\s\S]{0,200}role="status"/;
    expect(src).toMatch(statusPattern);
  });
});
