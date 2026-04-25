/**
 * Regression test for #1312: annotation action buttons on the notes page
 * must have unique aria-labels that identify which annotation they act on.
 */
import * as fs from "fs";
import * as path from "path";

const src = fs.readFileSync(
  path.join(__dirname, "../app/notes/[bookId]/page.tsx"),
  "utf8"
);

describe("Notes page annotation button unique aria-labels (closes #1312)", () => {
  it("Edit button label includes annotation sentence text", () => {
    expect(src).toContain("Edit annotation:");
  });

  it("Delete annotation button label includes annotation sentence text", () => {
    expect(src).toContain("Delete annotation:");
  });

  it("Delete insight button label includes insight question text", () => {
    expect(src).toContain("Delete insight:");
  });

  it("Labels use slice(0, 60) to truncate long text", () => {
    expect(src).toContain(".slice(0, 60)");
  });
});
