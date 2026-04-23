/**
 * Test to verify that QueueTab uses proper SVG icons instead of emoji
 * for status indicators in worker logs. Emoji characters should not be
 * used as UI indicators due to inconsistent rendering and accessibility issues.
 */

describe("QueueTab emoji icons compliance", () => {
  it("should use CheckIcon instead of emoji for translated status", () => {
    // This test verifies the implementation uses CheckIcon, not the ✓ emoji.
    // The actual component change will render SVG icons from Icons.tsx
    // instead of emoji characters in the worker log.

    // Read the source to verify icons are imported
    const fs = require("fs");
    const queueTabPath = require.resolve("@/components/QueueTab");
    const source = fs.readFileSync(queueTabPath, "utf-8");

    // Should import CheckIcon
    expect(source).toMatch(/import.*CheckIcon/);
    // Should import AlertCircleIcon or similar for errors
    expect(source).toMatch(/import.*(AlertCircleIcon|AlertIcon|ErrorIcon)/);

    // Should NOT use emoji in the status rendering
    // The emoji ✓ should be replaced with SVG icon
    expect(source).not.toMatch(/"\s*✓\s*"\s*:\s*"!"/);
  });

  it("should render SVG icons for each log event status", () => {
    // Verify that the log rendering uses inline icon rendering
    // rather than emoji literals

    const fs = require("fs");
    const queueTabPath = require.resolve("@/components/QueueTab");
    const source = fs.readFileSync(queueTabPath, "utf-8");

    // Should have CheckIcon imported
    expect(source).toMatch(/CheckIcon/);

    // Should have AlertCircleIcon imported
    expect(source).toMatch(/AlertCircleIcon/);

    // Should NOT use emoji characters in the conditional rendering
    // The old code had: {e.event === "translated" ? "✓" : "!"}
    // The new code should have CheckIcon and AlertCircleIcon instead
    expect(source).not.toMatch(/\{"✓"/);
    expect(source).not.toMatch(/"!"\}/);

    // Should use conditional CheckIcon/AlertCircleIcon rendering
    expect(source).toMatch(/e\.event.*===.*"translated".*\?.*CheckIcon/s);
  });
});
