/**
 * Regression tests for #2527:
 * Reader sidebar error panels for annotations and vocabulary must use
 * role="alert" (assertive) not role="status" (polite) — ARIA 4.1.3.
 */
import fs from "fs";
import path from "path";

const src = fs.readFileSync(
  path.resolve(__dirname, "..", "app/reader/[bookId]/page.tsx"),
  "utf-8"
);

describe("Reader sidebar error panels — ARIA role (closes #2527)", () => {
  it("annotations error panel uses role=alert not role=status", () => {
    // Find the div surrounding the annotations error text (JSX uses &apos; entity)
    const idx = src.indexOf("Couldn&apos;t load annotations");
    expect(idx).toBeGreaterThan(-1);
    // Look back up to 300 chars for the opening div/role attribute
    const context = src.slice(Math.max(0, idx - 300), idx);
    // The nearest role= before the error text must be "alert", not "status"
    const roles = [...context.matchAll(/role="(\w+)"/g)];
    const nearestRole = roles.length > 0 ? roles[roles.length - 1][1] : null;
    expect(nearestRole).toBe("alert");
  });

  it("vocabulary error panel uses role=alert not role=status", () => {
    const idx = src.indexOf("Couldn&apos;t load vocabulary");
    expect(idx).toBeGreaterThan(-1);
    const context = src.slice(Math.max(0, idx - 300), idx);
    const roles = [...context.matchAll(/role="(\w+)"/g)];
    const nearestRole = roles.length > 0 ? roles[roles.length - 1][1] : null;
    expect(nearestRole).toBe("alert");
  });
});
