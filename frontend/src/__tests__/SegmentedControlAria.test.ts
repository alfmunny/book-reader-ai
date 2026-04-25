/**
 * Static assertions: SegmentedControl in TypographyPanel exposes selection via aria-pressed
 * and groups buttons via role=group.
 * Closes #1115
 */
import fs from "fs";
import path from "path";

const panel = fs.readFileSync(
  path.join(process.cwd(), "src/components/TypographyPanel.tsx"),
  "utf8",
);

describe("TypographyPanel SegmentedControl ARIA", () => {
  it("wrapper div has role=group", () => {
    // Find the SegmentedControl function body and verify role=group
    expect(panel).toContain('role="group"');
  });

  it("segmented buttons expose aria-pressed for selection state", () => {
    expect(panel).toMatch(/aria-pressed=\{value === opt\.value\}/);
  });

  it("SegmentedControl accepts a label prop and forwards it as aria-label", () => {
    // Group should have aria-label so screen readers know what the group controls
    expect(panel).toMatch(/aria-label=\{label\}/);
  });
});
