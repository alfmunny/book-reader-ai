import * as fs from "fs";
import * as path from "path";

const src = fs.readFileSync(
  path.join(__dirname, "../app/notes/[bookId]/page.tsx"),
  "utf8",
);

describe("notes collapse-all button aria-expanded (WCAG 4.1.2) (closes #1390)", () => {
  it("Collapse all / Expand all button has aria-expanded", () => {
    // The button's visible text already changes, but aria-expanded is required
    // by WCAG 4.1.2 so screen readers can announce state without reading the label.
    expect(src).toMatch(/toggleCollapseAll[\s\S]{0,200}?aria-expanded=/);
  });
});
