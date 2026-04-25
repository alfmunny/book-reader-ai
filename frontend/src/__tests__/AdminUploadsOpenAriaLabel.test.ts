import fs from "fs";
import path from "path";

const src = fs.readFileSync(
  path.join(__dirname, "../app/admin/uploads/page.tsx"),
  "utf8"
);

describe("admin uploads Open button aria-label (issue #1275)", () => {
  it("open button has aria-label with book title context", () => {
    expect(src).toMatch(/aria-label=\{`Open \$\{u\.title\}`\}/);
  });
});
