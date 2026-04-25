import fs from "fs";
import path from "path";

const src = fs.readFileSync(
  path.join(__dirname, "../app/admin/users/page.tsx"),
  "utf8"
);

describe("admin users button aria-labels (issue #1270)", () => {
  it("approve/revoke button has aria-label with user name", () => {
    expect(src).toMatch(/aria-label=\{u\.approved \? `Revoke \$\{u\.name\}` : `Approve \$\{u\.name\}`\}/);
  });

  it("delete button has aria-label with user name", () => {
    expect(src).toMatch(/aria-label=\{`Delete \$\{u\.name\}`\}/);
  });

  it("delete button text is 'Delete' not 'Del'", () => {
    expect(src).toMatch(/>\s*Delete\s*<\/button>/);
    expect(src).not.toMatch(/>\s*Del\s*<\/button>/);
  });
});
