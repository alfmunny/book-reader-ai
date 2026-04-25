import fs from "fs";
import path from "path";

const src = fs.readFileSync(
  path.join(__dirname, "../app/page.tsx"),
  "utf8",
);

describe("homepage stats expand/collapse button aria-expanded (issue #1282)", () => {
  it("adds aria-expanded to stats expand toggle", () => {
    expect(src).toMatch(/aria-expanded=\{statsExpanded\}/);
  });
});
