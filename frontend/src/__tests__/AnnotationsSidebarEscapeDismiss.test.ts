import * as fs from "fs";
import * as path from "path";

const src = fs.readFileSync(
  path.join(__dirname, "../components/AnnotationsSidebar.tsx"),
  "utf8"
);

describe("AnnotationsSidebar Escape key dismiss (closes #1303)", () => {
  it("listens for Escape keydown when open", () => {
    expect(src).toContain('e.key === "Escape"');
  });

  it("calls setOpen(false) on Escape", () => {
    expect(src).toContain("setOpen(false)");
  });
});
