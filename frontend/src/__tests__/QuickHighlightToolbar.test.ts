/**
 * Static assertions: QuickHighlightPanel exposed as a toolbar.
 * Closes #1102
 */
import fs from "fs";
import path from "path";

const panel = fs.readFileSync(
  path.join(process.cwd(), "src/components/QuickHighlightPanel.tsx"),
  "utf8",
);

describe("QuickHighlightPanel toolbar role", () => {
  it("root panel div has role=toolbar", () => {
    expect(panel).toContain('role="toolbar"');
  });

  it("root panel div has aria-label", () => {
    expect(panel).toMatch(/aria-label="Highlight (options|actions)"/);
  });
});
