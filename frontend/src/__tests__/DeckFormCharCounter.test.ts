/**
 * Regression #2391: deck form name and description inputs must display
 * live character counters so users know when they're approaching maxLength.
 * Previously both fields had silent maxLength with no feedback.
 */
import fs from "fs";
import path from "path";

const src = fs.readFileSync(
  path.resolve(__dirname, "../app/decks/new/page.tsx"),
  "utf8"
);

describe("Deck form character counters (issue #2391)", () => {
  it("name input still has maxLength={80}", () => {
    expect(src).toContain("maxLength={80}");
  });

  it("description textarea still has maxLength={500}", () => {
    expect(src).toContain("maxLength={500}");
  });

  it("shows a character counter for the name field", () => {
    // Counter should reference name.length and 80
    expect(src).toMatch(/name\.length.*80|80.*name\.length/);
  });

  it("shows a character counter for the description field", () => {
    // Counter should reference description.length and 500
    expect(src).toMatch(/description\.length.*500|500.*description\.length/);
  });

  it("counter uses aria-live for screen reader announcements", () => {
    expect(src).toContain('aria-live');
  });

  it("counter turns red near the limit", () => {
    // Should have conditional red color class when near limit
    expect(src).toMatch(/text-red-[456]00.*name\.length|name\.length.*text-red-[456]00/s);
  });
});
