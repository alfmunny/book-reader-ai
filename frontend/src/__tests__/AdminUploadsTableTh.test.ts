/**
 * Regression test for #1337: admin uploads table actions column header
 * must have an accessible name so screen readers can identify the column.
 */
import * as fs from "fs";
import * as path from "path";

const src = fs.readFileSync(
  path.join(__dirname, "../app/admin/uploads/page.tsx"),
  "utf8",
);

describe("Admin uploads table actions column header (closes #1337)", () => {
  it("has no <th> with empty body and no accessible name", () => {
    // A th with no aria-label AND no visible text is inaccessible.
    // The pattern captures: <th ...> </th> where the tag has no aria-label.
    expect(src).not.toMatch(/<th(?![^>]*aria-label)[^>]*>\s*<\/th>/);
  });

  it("actions column th has aria-label=\"Actions\"", () => {
    expect(src).toContain('aria-label="Actions"');
  });
});
