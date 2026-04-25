/**
 * Static assertions: AnnotationsSidebar drawer has dialog role + accessible name + focus management.
 * Closes #1106
 */
import fs from "fs";
import path from "path";

const sidebar = fs.readFileSync(
  path.join(process.cwd(), "src/components/AnnotationsSidebar.tsx"),
  "utf8",
);

describe("AnnotationsSidebar drawer dialog semantics", () => {
  it("drawer root has role=dialog", () => {
    expect(sidebar).toContain('role="dialog"');
  });

  it("drawer is labelled by the Annotations heading", () => {
    expect(sidebar).toContain('aria-labelledby="annotations-heading"');
    expect(sidebar).toContain('id="annotations-heading"');
  });

  it("drawer div has tabIndex={-1} for programmatic focus", () => {
    expect(sidebar).toContain("tabIndex={-1}");
  });

  it("focuses the drawer when opened (useEffect with focus call)", () => {
    expect(sidebar).toMatch(/drawerRef\.current\?\.focus\(\)|drawerRef\.current\.focus\(\)/);
  });
});
